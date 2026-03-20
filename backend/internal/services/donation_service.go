package services

import (
	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// DonationService 打赏服务
type DonationService struct {
	db *gorm.DB
}

// NewDonationService 创建打赏服务
func NewDonationService(db *gorm.DB) *DonationService {
	return &DonationService{db: db}
}

// GetDonationConfig 获取打赏配置（管理员）
func (s *DonationService) GetDonationConfig(c *gin.Context) {
	userID := c.GetUint("user_id")

	var config models.DonationConfig
	result := s.db.Where("user_id = ?", userID).First(&config)

	if result.Error == gorm.ErrRecordNotFound {
		config = models.DonationConfig{
			UserID:        userID,
			Enabled:       false,
			DefaultAmount: 500,
			ShowDonors:    true,
		}
		s.db.Create(&config)
	}

	utils.Success(c, config)
}

// UpdateDonationConfig 更新打赏配置
func (s *DonationService) UpdateDonationConfig(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req models.UpdateDonationConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	var config models.DonationConfig
	result := s.db.Where("user_id = ?", userID).First(&config)

	if result.Error == gorm.ErrRecordNotFound {
		config = models.DonationConfig{
			UserID: userID,
		}
		s.db.Create(&config)
	}

	updates := map[string]any{}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if req.AlipayQR != nil {
		updates["alipay_qr"] = *req.AlipayQR
	}
	if req.WechatQR != nil {
		updates["wechat_qr"] = *req.WechatQR
	}
	if req.PaypalLink != nil {
		updates["paypal_link"] = *req.PaypalLink
	}
	if req.DefaultAmount != nil {
		updates["default_amount"] = *req.DefaultAmount
	}
	if req.CustomMessage != nil {
		updates["custom_message"] = *req.CustomMessage
	}
	if req.ShowDonors != nil {
		updates["show_donors"] = *req.ShowDonors
	}

	if len(updates) > 0 {
		if err := s.db.Model(&config).Updates(updates).Error; err != nil {
			logger.Error("更新打赏配置失败", zap.Uint("user_id", userID), zap.Error(err))
			utils.InternalError(c, "更新配置失败")
			return
		}
		_ = s.db.Where("user_id = ?", userID).First(&config)
	}

	utils.Success(c, gin.H{"message": "更新成功", "config": config})
}

// GetPublicDonationConfig 获取公开的打赏配置（用户查看）
func (s *DonationService) GetPublicDonationConfig(c *gin.Context) {
	authorID := c.Query("author_id")

	var config models.DonationConfig
	if err := s.db.Where("user_id = ? AND enabled = ?", authorID, true).First(&config).Error; err != nil {
		utils.NotFound(c, "未开启打赏")
		return
	}

	utils.Success(c, gin.H{
		"alipay_qr":      config.AlipayQR,
		"wechat_qr":      config.WechatQR,
		"paypal_link":    config.PaypalLink,
		"custom_message": config.CustomMessage,
	})
}
