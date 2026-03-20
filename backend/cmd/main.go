package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/tinkerhero/blog/backend/internal/bootstrap"
	"github.com/tinkerhero/blog/backend/internal/middleware"
	"github.com/tinkerhero/blog/backend/internal/router"
	"github.com/tinkerhero/blog/backend/internal/services"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"go.uber.org/zap"
)

func main() {
	// 加载配置
	cfg := bootstrap.LoadConfig()

	// 初始化日志
	bootstrap.InitLogger(cfg)
	defer logger.Sync()

	logger.Info("Starting blog application")

	// 初始化数据库
	db, err := bootstrap.InitDatabase()
	if err != nil {
		logger.Fatalf("Failed to connect to database: %v", err)
	}

	// 初始化Redis
	rdb := bootstrap.InitRedis()

	// 初始化认证中间件（Token黑名单）
	middleware.InitAuth(rdb)

	// 初始化CDN
	bootstrap.InitCDN()

	// 初始化服务
	svc := bootstrap.InitServices(db, rdb, cfg)

	// 初始化搜索服务（可选）
	searchService := bootstrap.InitSearchService(db, cfg.ESURL, cfg.ESUser, cfg.ESPassword)
	if searchService != nil {
		svc.SearchService = searchService
		svc.PostService.SetSearchService(searchService)
		if svc.OpenAPIService != nil {
			svc.OpenAPIService.SetSearchService(searchService)
		}
		logger.Info("Elasticsearch initialized")
		// Sync existing posts to ES index in background
		go func() {
			if err := searchService.SyncAllPosts(); err != nil {
				logger.Error("Failed to sync posts to Elasticsearch", zap.Error(err))
			}
		}()
	} else {
		logger.Warn("Elasticsearch not available")
	}

	// 启动定时任务调度器
	svc.SchedulerService.Start()
	defer svc.SchedulerService.Stop()

	// 设置路由
	r := router.SetupRouter(cfg, svc)

	// 启动HTTP服务器
	port := cfg.Port
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      180 * time.Second, // AI 等长耗时接口需要更长时间
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// 非阻塞启动
	go func() {
		log.Printf("Server starting on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// 优雅关闭
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// 30 秒足以让大多数 AI 流式响应完成，同时避免无限等待
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	svc.PostService.StopViewCountSync()
	services.StopLoginCleanup()
	services.StopStateCleanup()
	middleware.StopAllRateLimiters()
	log.Println("Server exiting")
}
