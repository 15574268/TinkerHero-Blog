# 构建阶段
FROM golang:1.21-alpine AS builder

# 设置 Go 代理（中国镜像）
ENV GOPROXY=https://goproxy.cn,direct

WORKDIR /app

# 安装依赖
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码
COPY . .

# 编译
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd

# 运行阶段
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

# 从构建阶段复制二进制文件
COPY --from=builder /app/main .
COPY --from=builder /app/.env.example .env

# 暴露端口
EXPOSE 8080

# 运行
CMD ["./main"]
