package models

import (
	"time"
)

// DonationConfig 打赏配置
type DonationConfig struct {
	ID            uint      `json:"id" gorm:"primaryKey"`
	UserID        uint      `json:"user_id" gorm:"uniqueIndex;not null"` // 使用uniqueIndex
	User          User      `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Enabled       bool      `json:"enabled" gorm:"default:false"`
	AlipayQR      string    `json:"alipay_qr" gorm:"type:text"`
	WechatQR      string    `json:"wechat_qr" gorm:"type:text"`
	PaypalLink    string    `json:"paypal_link" gorm:"size:200"`
	DefaultAmount int64     `json:"default_amount" gorm:"default:500"` // 默认打赏金额（分）
	CustomMessage string    `json:"custom_message" gorm:"size:500"`
	ShowDonors    bool      `json:"show_donors" gorm:"default:true"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (DonationConfig) TableName() string {
	return "donation_configs"
}

// UpdateDonationConfigRequest 更新打赏配置请求
type UpdateDonationConfigRequest struct {
	Enabled       *bool   `json:"enabled"`
	AlipayQR      *string `json:"alipay_qr"`
	WechatQR      *string `json:"wechat_qr"`
	PaypalLink    *string `json:"paypal_link" binding:"omitempty,max=200,url"`
	DefaultAmount *int64  `json:"default_amount" binding:"omitempty,gt=0,lte=10000000"` // 金额（分）
	CustomMessage *string `json:"custom_message" binding:"omitempty,max=500"`
	ShowDonors    *bool   `json:"show_donors"`
}
