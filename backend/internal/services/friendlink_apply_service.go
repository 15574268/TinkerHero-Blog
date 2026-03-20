package services

import (
	"fmt"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// FriendLinkApplyService 友链申请服务
type FriendLinkApplyService struct {
	db        *gorm.DB
	notifySvc *NotificationService
}

// NewFriendLinkApplyService 创建友链申请服务
func NewFriendLinkApplyService(db *gorm.DB, notifySvc *NotificationService) *FriendLinkApplyService {
	return &FriendLinkApplyService{db: db, notifySvc: notifySvc}
}

// ApplyFriendLink 申请友链
func (s *FriendLinkApplyService) ApplyFriendLink(c *gin.Context) {
	var req models.ApplyFriendLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 检查URL是否已存在申请
	var existingApply models.FriendLinkApply
	if err := s.db.Where("url = ? AND status = ?", req.URL, models.LinkStatusPending).
		First(&existingApply).Error; err == nil {
		utils.BadRequest(c, "该链接已有待审核的申请")
		return
	}

	// 检查URL是否已是友链
	var existingLink models.FriendLink
	if err := s.db.Where("url = ?", req.URL).First(&existingLink).Error; err == nil {
		utils.BadRequest(c, "该链接已是友链")
		return
	}

	// 获取用户ID（如果已登录）
	var appliedBy *uint
	if userID, exists := c.Get("user_id"); exists {
		uid, ok := userID.(uint)
		if !ok {
			logger.Error("用户ID类型错误", zap.Any("user_id", userID))
			utils.InternalError(c, "用户ID类型错误")
			return
		}
		appliedBy = &uid
	}

	apply := models.FriendLinkApply{
		Name:        req.Name,
		URL:         req.URL,
		Logo:        req.Logo,
		Description: req.Description,
		Email:       req.Email,
		Status:      models.LinkStatusPending,
		AppliedBy:   appliedBy,
	}

	if err := s.db.Create(&apply).Error; err != nil {
		logger.Error("提交友链申请失败", zap.String("url", req.URL), zap.Error(err))
		utils.InternalError(c, "提交申请失败")
		return
	}

	utils.Success(c, gin.H{
		"message":  "申请已提交，请等待审核",
		"apply_id": apply.ID,
	})
}

// GetApplies 获取友链申请列表（管理员）
func (s *FriendLinkApplyService) GetApplies(c *gin.Context) {
	status := c.Query("status")
	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	query := s.db.Model(&models.FriendLinkApply{})
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var applies []models.FriendLinkApply
	query = query.Order("created_at desc").
		Offset(utils.GetOffset(page, pageSize)).
		Limit(pageSize)

	if err := query.Find(&applies).Error; err != nil {
		logger.Error("获取友链申请列表失败", zap.Error(err))
		utils.InternalError(c, "获取申请列表失败")
		return
	}

	utils.Paginated(c, applies, total, page, pageSize)
}

// HandleApply 处理友链申请（管理员）
func (s *FriendLinkApplyService) HandleApply(c *gin.Context) {
	id := c.Param("id")

	var req models.HandleApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var apply models.FriendLinkApply
	if err := s.db.First(&apply, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "申请不存在")
		return
	}

	if apply.Status != models.LinkStatusPending {
		utils.BadRequest(c, "该申请已处理")
		return
	}

	tx := s.db.Begin()

	// 更新申请状态
	if err := tx.Model(&apply).Updates(map[string]any{
		"status": req.Status,
		"reason": req.Reason,
	}).Error; err != nil {
		tx.Rollback()
		logger.Error("更新友链申请状态失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "更新状态失败")
		return
	}

	// 如果通过，创建友链
	if req.Status == models.LinkStatusApproved {
		link := models.FriendLink{
			Name:      apply.Name,
			URL:       apply.URL,
			Logo:      apply.Logo,
			Desc:      apply.Description,
			Status:    true,
			SortOrder: 0,
		}
		if err := tx.Create(&link).Error; err != nil {
			tx.Rollback()
			logger.Error("创建友链失败", zap.String("url", apply.URL), zap.Error(err))
			utils.InternalError(c, "创建友链失败")
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "提交事务失败")
		return
	}

	// 发送审核结果邮件给申请人
	if apply.Email != "" && s.notifySvc != nil {
		go s.sendApplyResultEmail(&apply, req.Status, req.Reason)
	}

	utils.Success(c, gin.H{
		"message": "处理成功",
		"status":  req.Status,
	})
}

// DeleteApply 删除申请（管理员）
func (s *FriendLinkApplyService) DeleteApply(c *gin.Context) {
	id := c.Param("id")

	if err := s.db.Delete(&models.FriendLinkApply{}, "id = ?", id).Error; err != nil {
		logger.Error("删除友链申请失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	utils.SuccessWithMessage(c, "删除成功", nil)
}

// GetApplyStatus 查询申请状态（申请人）
func (s *FriendLinkApplyService) GetApplyStatus(c *gin.Context) {
	id := c.Param("id")

	var apply models.FriendLinkApply
	if err := s.db.Select("id, name, status, reason, created_at").
		First(&apply, id).Error; err != nil {
		utils.NotFound(c, "申请不存在")
		return
	}

	utils.Success(c, apply)
}

// GetMyApplies 获取我的申请（登录用户）
func (s *FriendLinkApplyService) GetMyApplies(c *gin.Context) {
	userID := c.GetUint("user_id")

	var applies []models.FriendLinkApply
	s.db.Where("applied_by = ?", userID).
		Order("created_at desc").
		Find(&applies)

	utils.Success(c, applies)
}

// sendApplyResultEmail 发送友链审核结果邮件给申请人
func (s *FriendLinkApplyService) sendApplyResultEmail(apply *models.FriendLinkApply, status models.FriendLinkStatus, reason string) {
	siteURL := os.Getenv("FRONTEND_URL")
	if siteURL == "" {
		siteURL = "http://localhost:3000"
	}

	var subject, body string
	switch status {
	case models.LinkStatusApproved:
		subject = "【友链申请】您的友链申请已通过审核"
		body = fmt.Sprintf(`您好，

您申请的友链已通过审核，现已添加到本站友链列表中。

友链名称：%s
友链地址：%s

感谢您的关注与支持！欢迎访问本站：%s/links
`, apply.Name, apply.URL, siteURL)

	case models.LinkStatusRejected:
		subject = "【友链申请】您的友链申请未通过审核"
		reasonText := "（未提供原因）"
		if reason != "" {
			reasonText = reason
		}
		body = fmt.Sprintf(`您好，

很遗憾，您申请的友链未能通过审核。

友链名称：%s
友链地址：%s
拒绝原因：%s

如有疑问，欢迎重新提交申请或联系站长。
`, apply.Name, apply.URL, reasonText)

	default:
		return
	}

	s.notifySvc.EnqueueEmail(apply.Email, subject, body)
	logger.Info("友链审核结果邮件已加入队列",
		zap.String("email", apply.Email),
		zap.String("status", string(status)),
		zap.Uint("apply_id", apply.ID),
	)
}

// GetApplyStatusByURL 根据申请网址查询申请状态（公开接口，无需登录）
func (s *FriendLinkApplyService) GetApplyStatusByURL(c *gin.Context) {
	siteURL := c.Query("url")
	if siteURL == "" {
		utils.BadRequest(c, "请提供申请网址")
		return
	}

	var apply models.FriendLinkApply
	if err := s.db.Select("id, name, url, status, reason, created_at").
		Where("url = ?", siteURL).
		Order("created_at desc").
		First(&apply).Error; err != nil {
		utils.NotFound(c, "未找到该网址的申请记录")
		return
	}

	utils.Success(c, apply)
}
