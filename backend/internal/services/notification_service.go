package services

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type NotificationService struct {
	db          *gorm.DB
	smtpHost    string
	smtpPort    string
	smtpUser    string
	smtpPass    string
	from        string
	getConfig   func(key string) string // 优先从后台配置读取，为空则用下面 env 兜底
	emailQueue  chan emailTask
	workerWg    sync.WaitGroup
}

type emailTask struct {
	to      string
	subject string
	body    string
	retries int
}

// NewNotificationService 仅用 env 创建（保留兼容）
func NewNotificationService(db *gorm.DB, smtpHost, smtpPort, smtpUser, smtpPass, from string) *NotificationService {
	return NewNotificationServiceWithConfig(db, nil, smtpHost, smtpPort, smtpUser, smtpPass, from)
}

// NewNotificationServiceWithConfig 优先从 getConfig 读 SMTP，为空则用 env 参数
func NewNotificationServiceWithConfig(db *gorm.DB, getConfig func(key string) string, smtpHost, smtpPort, smtpUser, smtpPass, from string) *NotificationService {
	svc := &NotificationService{
		db:         db,
		smtpHost:   smtpHost,
		smtpPort:   smtpPort,
		smtpUser:   smtpUser,
		smtpPass:   smtpPass,
		from:       from,
		getConfig:  getConfig,
		emailQueue: make(chan emailTask, 100),
	}
	svc.startEmailWorkers(3)
	return svc
}

// Stop 停止邮件工作协程，等待剩余任务完成
func (s *NotificationService) Stop() {
	close(s.emailQueue)
	s.workerWg.Wait()
}

// startEmailWorkers 启动邮件发送工作协程
func (s *NotificationService) startEmailWorkers(numWorkers int) {
	for i := 0; i < numWorkers; i++ {
		s.workerWg.Add(1)
		go s.emailWorker()
	}
}

// emailWorker 邮件发送工作协程
func (s *NotificationService) emailWorker() {
	defer s.workerWg.Done()
	for task := range s.emailQueue {
		if err := s.sendEmailWithRetry(task); err != nil {
			logger.Error("Failed to send email after retries", zap.String("to", task.to), zap.Error(err))
		}
	}
}

// sendEmailWithRetry 带重试的邮件发送
func (s *NotificationService) sendEmailWithRetry(task emailTask) error {
	var lastErr error
	maxRetries := 3
	if task.retries > 0 {
		maxRetries = task.retries
	}

	for i := 0; i < maxRetries; i++ {
		if err := s.sendEmail(task.to, task.subject, task.body); err != nil {
			lastErr = err
			// 指数退避
			time.Sleep(time.Duration(i+1) * time.Second * 2)
			continue
		}
		return nil
	}
	return lastErr
}

// EnqueueEmail 将邮件加入发送队列（供其他服务使用）
func (s *NotificationService) EnqueueEmail(to, subject, body string) {
	select {
	case s.emailQueue <- emailTask{to: to, subject: subject, body: body, retries: 3}:
	default:
		logger.Warn("Email queue full, dropping email", zap.String("to", to))
	}
}

// SendCommentNotification 发送评论通知
func (s *NotificationService) SendCommentNotification(comment *models.Comment, post *models.Post) error {
	// 获取文章作者
	var author models.User
	if err := s.db.First(&author, post.AuthorID).Error; err != nil {
		return err
	}

	// Resolve display name for logged-in commenters
	commentAuthor := comment.Author
	if comment.UserID != nil {
		var commentUser models.User
		if s.db.First(&commentUser, *comment.UserID).Error == nil {
			commentAuthor = commentUser.Nickname
			if commentAuthor == "" {
				commentAuthor = commentUser.Username
			}
		}
	}

	// 创建站内通知
	notification := models.Notification{
		UserID:  &author.ID,
		Type:    "comment",
		Title:   fmt.Sprintf("您的文章《%s》有新评论", post.Title),
		Content: fmt.Sprintf("%s评论了您的文章", commentAuthor),
	}

	s.db.Create(&notification)

	// 发送邮件通知（异步，带重试）
	if author.Email != "" {
		frontendURL := os.Getenv("FRONTEND_URL")
		if frontendURL == "" {
			frontendURL = "http://localhost:3000"
		}

		subject := fmt.Sprintf("【博客】您的文章有新评论 - %s", post.Title)
		body := fmt.Sprintf(`
您的文章《%s》收到了一条新评论：

评论者：%s
评论内容：%s

查看详情：%s
		`, post.Title, commentAuthor, comment.Content, frontendURL+"/posts/"+fmt.Sprintf("%d", post.ID))

		// 加入邮件队列
		select {
		case s.emailQueue <- emailTask{to: author.Email, subject: subject, body: body, retries: 3}:
		default:
			// 队列已满，记录日志
			logger.Warn("Email queue full, failed to queue notification", zap.String("email", author.Email))
		}
	}

	return nil
}

// sendEmail 发送邮件（SMTP 优先从后台配置读取，为空则用 env 兜底）
// 自动区分 port 465（隐式 TLS/SSL）和 port 587/25（STARTTLS）
func (s *NotificationService) sendEmail(to, subject, body string) error {
	host, port, user, pass, from := s.smtpHost, s.smtpPort, s.smtpUser, s.smtpPass, s.from
	if s.getConfig != nil {
		if v := s.getConfig("smtp_host"); v != "" {
			host = v
		}
		if v := s.getConfig("smtp_port"); v != "" {
			port = v
		}
		if v := s.getConfig("smtp_user"); v != "" {
			user = v
		}
		if v := s.getConfig("smtp_password"); v != "" {
			pass = v
		}
		if v := s.getConfig("smtp_from"); v != "" {
			from = v
		}
	}
	if host == "" || user == "" || pass == "" {
		return fmt.Errorf("smtp not configured")
	}

	// 防止邮件头注入：Subject 中不允许出现换行符
	subject = strings.ReplaceAll(strings.ReplaceAll(subject, "\r", ""), "\n", "")

	auth := smtp.PlainAuth("", user, pass, host)
	msg := []byte(fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		from, to, subject, body,
	))

	// port 465 使用隐式 TLS（SSL），标准 smtp.SendMail 仅支持 STARTTLS（587/25）
	if port == "465" {
		return s.sendEmailSSL(host, port, auth, from, to, msg)
	}
	return smtp.SendMail(host+":"+port, auth, from, []string{to}, msg)
}

// sendEmailSSL 使用隐式 TLS 连接（port 465）发送邮件
func (s *NotificationService) sendEmailSSL(host, port string, auth smtp.Auth, from, to string, msg []byte) error {
	tlsCfg := &tls.Config{
		ServerName: host,
		MinVersion: tls.VersionTLS12,
	}
	conn, err := tls.Dial("tcp", host+":"+port, tlsCfg)
	if err != nil {
		return fmt.Errorf("TLS dial %s:%s failed: %w", host, port, err)
	}
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("SMTP client init failed: %w", err)
	}
	defer c.Close()
	if err = c.Auth(auth); err != nil {
		return fmt.Errorf("SMTP auth failed: %w", err)
	}
	if err = c.Mail(from); err != nil {
		return err
	}
	if err = c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err = w.Write(msg); err != nil {
		return err
	}
	return w.Close()
}

// GetNotifications 获取用户通知
func (s *NotificationService) GetNotifications(c *gin.Context) {
	userID := c.GetUint("user_id")

	var notifications []models.Notification
	s.db.Where("user_id = ?", userID).
		Order("created_at desc").
		Limit(50).
		Find(&notifications)

	utils.Success(c, notifications)
}

// MarkNotificationAsRead 标记通知为已读
func (s *NotificationService) MarkNotificationAsRead(c *gin.Context) {
	userID := c.GetUint("user_id")
	id := c.Param("id")

	if err := s.db.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("is_read", true).Error; err != nil {
		logger.Error("标记通知失败", zap.String("id", id), zap.Error(err))
		utils.InternalError(c, "标记失败")
		return
	}

	utils.SuccessWithMessage(c, "标记成功", nil)
}

// MarkAllNotificationsAsRead 标记所有通知为已读
func (s *NotificationService) MarkAllNotificationsAsRead(c *gin.Context) {
	userID := c.GetUint("user_id")

	if err := s.db.Model(&models.Notification{}).
		Where("user_id = ?", userID).
		Update("is_read", true).Error; err != nil {
		logger.Error("标记所有通知失败", zap.Uint("user_id", userID), zap.Error(err))
		utils.InternalError(c, "标记失败")
		return
	}

	utils.SuccessWithMessage(c, "标记成功", nil)
}

// GetUnreadCount 获取未读通知数量
func (s *NotificationService) GetUnreadCount(c *gin.Context) {
	userID := c.GetUint("user_id")

	var count int64
	s.db.Model(&models.Notification{}).
		Where("user_id = ? AND is_read = ?", userID, false).
		Count(&count)

	utils.Success(c, gin.H{"count": count})
}
