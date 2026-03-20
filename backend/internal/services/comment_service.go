package services

import (
	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type CommentService struct {
	db          *gorm.DB
	getConfig   func(key string) string
	systemSvc   *SystemService
	captchaSvc  *CaptchaService
	notifySvc   *NotificationService
}

func NewCommentService(db *gorm.DB, getConfig func(key string) string, systemSvc *SystemService, captchaSvc *CaptchaService, notifySvc *NotificationService) *CommentService {
	return &CommentService{db: db, getConfig: getConfig, systemSvc: systemSvc, captchaSvc: captchaSvc, notifySvc: notifySvc}
}

const maxCommentDepth = 10 // 评论树最大深度，防止极深嵌套导致栈溢出

// GetPostComments 获取文章评论（支持分页）
func (s *CommentService) GetPostComments(c *gin.Context) {
	postID := c.Param("id")

	page, pageSize := utils.GetPagination(c)
	if pageSize > 100 {
		pageSize = 100 // 单页上限 100 条根评论
	}

	// 先查根评论总数（用于分页）
	var total int64
	if err := s.db.Model(&models.Comment{}).
		Where("post_id = ? AND status = ? AND parent_id IS NULL", postID, models.CommentApproved).
		Count(&total).Error; err != nil {
		logger.Error("获取评论总数失败", zap.String("post_id", postID), zap.Error(err))
		utils.InternalError(c, "获取评论失败")
		return
	}

	// 查本页根评论
	var rootComments []models.Comment
	offset := utils.GetOffset(page, pageSize)
	if err := s.db.Where("post_id = ? AND status = ? AND parent_id IS NULL", postID, models.CommentApproved).
		Preload("User").
		Order("created_at desc").
		Limit(pageSize).Offset(offset).
		Find(&rootComments).Error; err != nil {
		logger.Error("获取评论失败", zap.String("post_id", postID), zap.Error(err))
		utils.InternalError(c, "获取评论失败")
		return
	}

	if len(rootComments) == 0 {
		utils.Success(c, utils.NewPaginatedResult(rootComments, total, page, pageSize).ToMap())
		return
	}

	// 收集本页根评论的 ID，批量拉取所有子评论（最多 2000 条）
	rootIDs := make([]uint, len(rootComments))
	for i, rc := range rootComments {
		rootIDs[i] = rc.ID
	}
	var children []models.Comment
	s.db.Where("post_id = ? AND status = ? AND parent_id IN ?", postID, models.CommentApproved, rootIDs).
		Preload("User").
		Order("created_at asc").
		Limit(2000).
		Find(&children)

	// 合并后构建评论树
	all := append(rootComments, children...)
	commentTree := s.buildCommentTree(all)

	utils.Success(c, utils.NewPaginatedResult(commentTree, total, page, pageSize).ToMap())
}

// buildCommentTree 构建评论树（O(n)，带深度上限防栈溢出）
func (s *CommentService) buildCommentTree(comments []models.Comment) []models.Comment {
	childrenMap := make(map[uint][]models.Comment)
	var rootComments []models.Comment

	for _, comment := range comments {
		if comment.ParentID == nil {
			rootComments = append(rootComments, comment)
		} else {
			childrenMap[*comment.ParentID] = append(childrenMap[*comment.ParentID], comment)
		}
	}

	var buildChildren func(comment *models.Comment, depth int)
	buildChildren = func(comment *models.Comment, depth int) {
		if depth >= maxCommentDepth {
			return // 超过最大深度，截断递归防止栈溢出
		}
		if children, exists := childrenMap[comment.ID]; exists {
			comment.Replies = children
			for i := range comment.Replies {
				buildChildren(&comment.Replies[i], depth+1)
			}
		}
	}

	for i := range rootComments {
		buildChildren(&rootComments[i], 0)
	}

	return rootComments
}

// CreateComment 创建评论
func (s *CommentService) CreateComment(c *gin.Context) {
	userID, exists := c.Get("user_id")

	var req models.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 评论需验证码时校验
	if s.getConfig != nil && s.getConfig("enable_captcha_comment") == "true" && s.captchaSvc != nil {
		if req.CaptchaID == "" || req.Captcha == "" {
			utils.BadRequest(c, "请完成验证码")
			return
		}
		if !s.captchaSvc.VerifyCaptcha(req.CaptchaID, req.Captcha) {
			utils.BadRequest(c, "验证码错误")
			return
		}
	}

	// 检查文章是否存在且允许评论
	var post models.Post
	if err := s.db.First(&post, "id = ?", req.PostID).Error; err != nil {
		utils.NotFound(c, "文章不存在")
		return
	}

	if !post.AllowComment {
		utils.BadRequest(c, "该文章不允许评论")
		return
	}

	// 清理评论内容，防止 XSS
	sanitizedContent := utils.SanitizeComment(req.Content)
	if len(sanitizedContent) < 1 {
		utils.BadRequest(c, "评论内容不能为空")
		return
	}
	if len(sanitizedContent) > 2000 {
		utils.BadRequest(c, "评论内容过长")
		return
	}

	// 敏感词过滤（若开启）
	if s.getConfig != nil && s.getConfig("enable_sensitive_filter") == "true" && s.systemSvc != nil {
		sanitizedContent = s.systemSvc.FilterSensitiveContent(sanitizedContent)
	}

	// 评论状态：是否需要审核；命中敏感词则待审
	commentStatus := models.CommentPending
	if s.getConfig != nil && s.getConfig("comment_need_audit") != "true" {
		commentStatus = models.CommentApproved
	}
	if s.getConfig != nil && s.getConfig("enable_sensitive_filter") == "true" && s.systemSvc != nil {
		if ok, _ := s.systemSvc.CheckSensitiveContent(sanitizedContent); ok {
			commentStatus = models.CommentPending
		}
	}

	comment := models.Comment{
		PostID:    req.PostID,
		ParentID:  req.ParentID,
		Content:   sanitizedContent,
		IPAddress: c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
		Status:    commentStatus,
	}

	// 已登录用户
	if exists {
		uid, ok := userID.(uint)
		if !ok {
			logger.Error("用户ID类型错误", zap.Any("user_id", userID))
			utils.InternalError(c, "用户ID类型错误")
			return
		}
		comment.UserID = &uid
	} else {
		// 游客必须提供昵称和邮箱
		if req.Author == "" || req.Email == "" {
			utils.BadRequest(c, "游客评论需要提供昵称和邮箱")
			return
		}
		comment.Author = req.Author
		comment.Email = req.Email
		comment.Website = req.Website
	}

	if err := s.db.Create(&comment).Error; err != nil {
		logger.Error("创建评论失败", zap.Error(err))
		utils.InternalError(c, "创建评论失败")
		return
	}

	// 异步发送评论通知给文章作者
	if s.notifySvc != nil {
		go func() {
			if err := s.notifySvc.SendCommentNotification(&comment, &post); err != nil {
				logger.Warn("评论通知发送失败", zap.Uint("comment_id", comment.ID), zap.Error(err))
			}
		}()
	}

	utils.Created(c, comment)
}

// UpdateCommentStatus 更新评论状态（管理员）
func (s *CommentService) UpdateCommentStatus(c *gin.Context) {
	id := c.Param("id")

	var req models.UpdateCommentStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var comment models.Comment
	if err := s.db.First(&comment, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "评论不存在")
		return
	}

	oldStatus := comment.Status
	if err := s.db.Model(&comment).Update("status", req.Status).Error; err != nil {
		logger.Error("更新状态失败", zap.String("comment_id", id), zap.Error(err))
		utils.InternalError(c, "更新状态失败")
		return
	}

	if oldStatus != models.CommentApproved && req.Status == models.CommentApproved {
		s.db.Model(&models.Post{}).Where("id = ?", comment.PostID).
			UpdateColumn("comment_count", gorm.Expr("comment_count + ?", 1))
	} else if oldStatus == models.CommentApproved && req.Status != models.CommentApproved {
		s.db.Model(&models.Post{}).Where("id = ?", comment.PostID).
			UpdateColumn("comment_count", gorm.Expr("GREATEST(comment_count - ?, 0)", 1))
	}

	utils.SuccessWithMessage(c, "更新成功", nil)
}

// DeleteComment 删除评论
func (s *CommentService) DeleteComment(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	var comment models.Comment
	if err := s.db.First(&comment, "id = ?", id).Error; err != nil {
		utils.NotFound(c, "评论不存在")
		return
	}

	// 权限检查：只有评论者本人或管理员可删除
	if role != "admin" {
		if comment.UserID == nil || *comment.UserID != userID {
			utils.Forbidden(c, "权限不足")
			return
		}
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 递归收集所有后代评论 ID
	var allDescendantIDs []uint
	var collectDescendants func(parentIDs []uint)
	collectDescendants = func(parentIDs []uint) {
		if len(parentIDs) == 0 {
			return
		}
		var children []models.Comment
		if err := tx.Where("parent_id IN ?", parentIDs).Find(&children).Error; err != nil {
			return
		}
		var childIDs []uint
		for _, child := range children {
			childIDs = append(childIDs, child.ID)
			allDescendantIDs = append(allDescendantIDs, child.ID)
		}
		collectDescendants(childIDs)
	}
	collectDescendants([]uint{comment.ID})

	// 统计要删除的已审核评论数量
	var deleteCount int64
	if comment.Status == models.CommentApproved {
		deleteCount = 1
	}
	if len(allDescendantIDs) > 0 {
		tx.Model(&models.Comment{}).Where("id IN ? AND status = ?", allDescendantIDs, models.CommentApproved).Count(&deleteCount)
		if comment.Status == models.CommentApproved {
			deleteCount++
		}
		// 删除所有后代评论
		if err := tx.Where("id IN ?", allDescendantIDs).Delete(&models.Comment{}).Error; err != nil {
			tx.Rollback()
			logger.Error("删除子评论失败", zap.String("comment_id", id), zap.Error(err))
			utils.InternalError(c, "删除子评论失败")
			return
		}
	}

	if err := tx.Delete(&comment).Error; err != nil {
		tx.Rollback()
		logger.Error("删除评论失败", zap.String("comment_id", id), zap.Error(err))
		utils.InternalError(c, "删除评论失败")
		return
	}

	if deleteCount > 0 {
		if err := tx.Model(&models.Post{}).Where("id = ?", comment.PostID).
			UpdateColumn("comment_count", gorm.Expr("GREATEST(comment_count - ?, 0)", deleteCount)).Error; err != nil {
			tx.Rollback()
			logger.Error("更新评论数失败", zap.String("comment_id", id), zap.Error(err))
			utils.InternalError(c, "更新评论数失败")
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		logger.Error("提交事务失败", zap.Error(err))
		utils.InternalError(c, "提交事务失败")
		return
	}

	utils.NoContent(c)
}

// GetAllComments 获取所有评论（管理员）
func (s *CommentService) GetAllComments(c *gin.Context) {
	status := c.Query("status")
	page, pageSize := utils.GetPagination(c)

	query := s.db.Model(&models.Comment{}).
		Preload("User").
		Preload("Post")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var comments []models.Comment
	query = query.Offset(utils.GetOffset(page, pageSize)).Limit(pageSize).Order("created_at desc")

	if err := query.Find(&comments).Error; err != nil {
		logger.Error("获取评论失败", zap.Error(err))
		utils.InternalError(c, "获取评论失败")
		return
	}

	utils.Paginated(c, comments, total, page, pageSize)
}
