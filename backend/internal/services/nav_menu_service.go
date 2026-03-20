package services

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const navMenuCacheKey = "nav_menus:visible"

type NavMenuService struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewNavMenuService(db *gorm.DB, rdb *redis.Client) *NavMenuService {
	svc := &NavMenuService{db: db, rdb: rdb}
	svc.seedDefaults()
	return svc
}

// seedDefaults 首次启动时写入默认导航菜单
func (s *NavMenuService) seedDefaults() {
	var count int64
	s.db.Model(&models.NavMenu{}).Count(&count)
	if count > 0 {
		return
	}

	logger.Info("导航菜单为空，写入默认数据")

	type child struct {
		Label     string
		LinkType  string
		LinkValue string
		Icon      string
	}
	type group struct {
		Label    string
		Icon     string
		Children []child
	}

	groups := []group{
		{
			Label: "记录生活", Icon: "PenTool",
			Children: []child{
				{"个人日记", "category", "diary", "PenTool"},
				{"旅行见闻", "category", "travel", "Globe"},
				{"美食体验", "category", "food", "Utensils"},
				{"摄影分享", "category", "photo", "Camera"},
			},
		},
		{
			Label: "技术分享", Icon: "Code2",
			Children: []child{
				{"AGI分享", "category", "agi", "Cpu"},
				{"经验分享", "category", "experience", "Share2"},
				{"系统运维", "category", "devops", "Server"},
				{"网站优化", "category", "optimization", "Globe"},
				{"编程语言", "category", "programming", "Code2"},
				{"软件分享", "category", "software", "MonitorSmartphone"},
			},
		},
		{
			Label: "博海拾贝", Icon: "Star",
			Children: []child{
				{"关于博主", "page", "/about", "User"},
				{"文章合集", "page", "/series", "BookOpen"},
				{"我的装备", "page", "/resources", "Package"},
			},
		},
		{
			Label: "更多", Icon: "Folder",
			Children: []child{
				{"文章归档", "page", "/archives", "Archive"},
				{"所有分类", "page", "/categories", "Folder"},
				{"标签云", "page", "/tags", "Tags"},
				{"留明信片", "page", "/subscribe", "Mail"},
			},
		},
	}

	topLevel := []child{
		{"友情链接", "page", "/links", "Link2"},
	}

	sortOrder := 1

	// 顶级分组
	for _, g := range groups {
		parent := models.NavMenu{
			Label:     g.Label,
			LinkType:  "group",
			Icon:      g.Icon,
			SortOrder: sortOrder,
			IsVisible: true,
		}
		if err := s.db.Create(&parent).Error; err != nil {
			logger.Error("写入默认导航失败", zap.String("label", g.Label), zap.Error(err))
			continue
		}
		for ci, ch := range g.Children {
			item := models.NavMenu{
				ParentID:  &parent.ID,
				Label:     ch.Label,
				LinkType:  ch.LinkType,
				LinkValue: ch.LinkValue,
				Icon:      ch.Icon,
				SortOrder: ci + 1,
				IsVisible: true,
			}
			s.db.Create(&item)
		}
		sortOrder++
	}

	// 顶级直链（如友情链接）
	for _, t := range topLevel {
		item := models.NavMenu{
			Label:     t.Label,
			LinkType:  t.LinkType,
			LinkValue: t.LinkValue,
			Icon:      t.Icon,
			SortOrder: sortOrder,
			IsVisible: true,
		}
		s.db.Create(&item)
		sortOrder++
	}

	logger.Info("默认导航菜单写入完成")
}

// GetVisibleMenus 公开接口：获取可见的导航菜单树（带缓存）
func (s *NavMenuService) GetVisibleMenus(c *gin.Context) {
	ctx := context.Background()

	if cached, err := s.rdb.Get(ctx, navMenuCacheKey).Result(); err == nil {
		c.Data(200, "application/json", []byte(cached))
		return
	}

	var menus []models.NavMenu
	if err := s.db.Where("is_visible = ?", true).Order("sort_order asc, id asc").Find(&menus).Error; err != nil {
		logger.Error("获取导航菜单失败", zap.Error(err))
		utils.InternalError(c, "获取导航菜单失败")
		return
	}

	tree := s.buildTree(menus, nil)

	wrapped := utils.APIResponse{Success: true, Data: tree}
	if data, err := json.Marshal(wrapped); err == nil {
		s.rdb.Set(ctx, navMenuCacheKey, string(data), 30*time.Minute)
	}

	utils.Success(c, tree)
}

// GetAllMenus 管理员接口：获取所有导航菜单（含隐藏项）
func (s *NavMenuService) GetAllMenus(c *gin.Context) {
	var menus []models.NavMenu
	if err := s.db.Order("sort_order asc, id asc").Find(&menus).Error; err != nil {
		logger.Error("获取导航菜单失败", zap.Error(err))
		utils.InternalError(c, "获取导航菜单失败")
		return
	}

	tree := s.buildTree(menus, nil)
	utils.Success(c, tree)
}

// CreateMenu 创建导航菜单项
func (s *NavMenuService) CreateMenu(c *gin.Context) {
	var req struct {
		ParentID  *uint  `json:"parent_id"`
		Label     string `json:"label" binding:"required"`
		LinkType  string `json:"link_type" binding:"required"`
		LinkValue string `json:"link_value"`
		Icon      string `json:"icon"`
		SortOrder int    `json:"sort_order"`
		IsVisible *bool  `json:"is_visible"`
		OpenNew   bool   `json:"open_new"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	visible := true
	if req.IsVisible != nil {
		visible = *req.IsVisible
	}

	menu := models.NavMenu{
		ParentID:  req.ParentID,
		Label:     req.Label,
		LinkType:  req.LinkType,
		LinkValue: req.LinkValue,
		Icon:      req.Icon,
		SortOrder: req.SortOrder,
		IsVisible: visible,
		OpenNew:   req.OpenNew,
	}

	if err := s.db.Create(&menu).Error; err != nil {
		logger.Error("创建导航菜单失败", zap.Error(err))
		utils.InternalError(c, "创建导航菜单失败")
		return
	}

	s.invalidateCache()
	logger.Info("创建导航菜单成功", zap.Uint("id", menu.ID), zap.String("label", menu.Label))
	utils.Created(c, menu)
}

// UpdateMenu 更新导航菜单项
func (s *NavMenuService) UpdateMenu(c *gin.Context) {
	id := c.Param("id")

	var menu models.NavMenu
	if err := s.db.First(&menu, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "菜单项不存在")
		return
	}

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		utils.BadRequest(c, "读取请求体失败")
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	var rawFields map[string]json.RawMessage
	if err := json.Unmarshal(bodyBytes, &rawFields); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var req struct {
		ParentID  *uint  `json:"parent_id"`
		Label     string `json:"label"`
		LinkType  string `json:"link_type"`
		LinkValue string `json:"link_value"`
		Icon      string `json:"icon"`
		SortOrder *int   `json:"sort_order"`
		IsVisible *bool  `json:"is_visible"`
		OpenNew   *bool  `json:"open_new"`
	}

	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	updates := map[string]any{}
	if _, ok := rawFields["parent_id"]; ok {
		updates["parent_id"] = req.ParentID
	}
	if req.Label != "" {
		updates["label"] = req.Label
	}
	if req.LinkType != "" {
		updates["link_type"] = req.LinkType
	}
	if _, ok := rawFields["link_value"]; ok {
		updates["link_value"] = req.LinkValue
	}
	if req.Icon != "" {
		updates["icon"] = req.Icon
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	if req.IsVisible != nil {
		updates["is_visible"] = *req.IsVisible
	}
	if req.OpenNew != nil {
		updates["open_new"] = *req.OpenNew
	}

	if err := s.db.Model(&menu).Updates(updates).Error; err != nil {
		logger.Error("更新导航菜单失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新导航菜单失败")
		return
	}

	s.invalidateCache()
	s.db.First(&menu, "id = ?", id)
	logger.Info("更新导航菜单成功", zap.String("id", id))
	utils.Success(c, menu)
}

// DeleteMenu 删除导航菜单项（级联删除子项）
func (s *NavMenuService) DeleteMenu(c *gin.Context) {
	id := c.Param("id")

	var menu models.NavMenu
	if err := s.db.First(&menu, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "菜单项不存在")
		return
	}

	// 删除所有子菜单
	s.db.Where("parent_id = ?", id).Delete(&models.NavMenu{})
	// 删除自身
	s.db.Delete(&menu)

	s.invalidateCache()
	logger.Info("删除导航菜单成功", zap.String("id", id))
	utils.NoContent(c)
}

// SortMenus 批量排序
func (s *NavMenuService) SortMenus(c *gin.Context) {
	var req struct {
		Items []struct {
			ID        uint  `json:"id" binding:"required"`
			SortOrder int   `json:"sort_order"`
			ParentID  *uint `json:"parent_id"`
		} `json:"items" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	tx := s.db.Begin()
	for _, item := range req.Items {
		if err := tx.Model(&models.NavMenu{}).Where("id = ?", item.ID).Updates(map[string]any{
			"sort_order": item.SortOrder,
			"parent_id":  item.ParentID,
		}).Error; err != nil {
			tx.Rollback()
			logger.Error("排序导航菜单失败", zap.Error(err))
			utils.InternalError(c, "排序失败")
			return
		}
	}
	tx.Commit()

	s.invalidateCache()
	utils.SuccessWithMessage(c, "排序成功", nil)
}

func (s *NavMenuService) buildTree(menus []models.NavMenu, parentID *uint) []models.NavMenu {
	var tree []models.NavMenu
	for _, m := range menus {
		if (parentID == nil && m.ParentID == nil) || (parentID != nil && m.ParentID != nil && *m.ParentID == *parentID) {
			m.Children = s.buildTree(menus, &m.ID)
			tree = append(tree, m)
		}
	}
	return tree
}

func (s *NavMenuService) invalidateCache() {
	ctx := context.Background()
	s.rdb.Del(ctx, navMenuCacheKey)
}
