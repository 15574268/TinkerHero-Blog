# 博客系统

基于 **Go (Gin) + Next.js** 的全栈博客系统，支持 Markdown 写作、评论、全文搜索、OAuth 登录、文件上传等功能。

演示站点：[https://blog.railx.cn/](https://blog.railx.cn/)
（请勿滥用，产生的一切后果与作者无关）
## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Go 1.21 · Gin · GORM · PostgreSQL · Redis · Elasticsearch |
| 前端 | Next.js · React · TypeScript · Tailwind CSS |
| 部署 | Docker · Docker Compose · OpenResty / Nginx |

---

## 目录结构

```
blog/
├── backend/               # Go 后端
│   ├── cmd/               # 程序入口
│   ├── internal/          # 业务逻辑
│   └── Dockerfile
├── frontend/              # Next.js 前端
│   └── Dockerfile
├── nginx/                 # Nginx 配置（参考）
├── elasticsearch/         # ES 自定义镜像（含 IK 分词）
├── docker-compose.yml     # 本地开发环境（全量容器化）
├── docker-compose.prod.yml# 生产环境（仅应用容器，接入 1Panel 基础服务）
└── .env.production        # 生产环境变量（需手动填写）
```

---

## 本地开发

### 前置要求

- Docker 20+ & Docker Compose 2+
- Go 1.21+（可选，直接用 Docker 也行）
- Node.js 18+（可选，直接用 Docker 也行）

### 一键启动

```bash
docker compose up -d --build
```

启动后访问：

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3200 |
| 后端 API | http://localhost:8080/api/v1 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

> 本地环境已内置 PostgreSQL、Redis、Elasticsearch，无需额外安装。

### 单独启动后端（Go 原生）

```bash
cd backend
cp .env.example .env   # 按需修改
go run ./cmd/main.go
```

### 单独启动前端

```bash
cd frontend
cp .env.example .env.local   # 按需修改
npm install
npm run dev
```

---

## 生产环境部署

本方案适用于使用 **1Panel** 面板管理服务器的场景：PostgreSQL、Redis、Elasticsearch 由 1Panel 统一管理，博客应用通过 Docker 部署，OpenResty 作为反向代理。

### 架构说明

```
外网请求
  │ HTTPS
  ▼
OpenResty（1Panel 管理）
  ├── /api/*      → 127.0.0.1:8080 → blog_backend 容器
  ├── /uploads/*  → 127.0.0.1:8080 → blog_backend 容器
  └── /*          → 127.0.0.1:3000 → blog_frontend 容器

blog_backend 容器
  └── 通过 1panel-network 直接访问 PostgreSQL / Redis / ES 容器
      （容器间通信，不经过宿主机端口）

blog_frontend 容器（SSR 服务端渲染时）
  └── http://backend:8080  → blog_backend 容器（blog_network 内网）
```

### 前置条件

- 服务器已安装 1Panel，并通过 1Panel 创建了 PostgreSQL、Redis、Elasticsearch 应用
- 上述三个服务均在 `1panel-network` Docker 网络中
- 服务器已安装 Docker 28+ 和 Docker Compose 2.40+

### 第一步：查询基础服务信息

```bash
# 查看所有容器名
docker ps --format '{{.Names}}'

# 确认三个服务都在 1panel-network
docker network inspect 1panel-network --format '{{range .Containers}}{{.Name}} {{end}}'
```

记录下 PostgreSQL、Redis、Elasticsearch 的容器名，格式通常为 `1Panel-postgresql-XXXX`。

### 第二步：配置 .env.production

将项目根目录的 `.env.production` 上传到服务器，并填写所有真实值：

```ini
# ---------- 站点域名 ----------
SITE_DOMAIN=https://your-domain.com

# ---------- PostgreSQL ----------
POSTGRES_HOST=1Panel-postgresql-XXXX   # 容器名
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_DB=blog
DB_PORT=5432
DB_NETWORK=1panel-network

# ---------- Redis ----------
REDIS_HOST=1Panel-redis-XXXX           # 容器名
REDIS_PASSWORD=your_redis_password
REDIS_PORT=6379

# ---------- Elasticsearch ----------
ES_HOST=1Panel-elasticsearch-XXXX      # 容器名
ES_PORT=9200

# ---------- JWT（至少 32 位随机字符串） ----------
JWT_SECRET=your-random-32-char-secret-here
```

> **注意：** 值后面不能有 `# 注释`，否则注释内容会被当作值的一部分。注释请单独写在独立的行上。

生成安全的 JWT_SECRET：

```bash
openssl rand -base64 48
```

### 第三步：创建数据库

```bash
# 在 PostgreSQL 容器内创建 blog 数据库
docker exec -it 1Panel-postgresql-XXXX psql -U postgres \
  -c "CREATE DATABASE blog OWNER your_db_user;"
```

### 第四步：部署应用容器

```bash
# 在项目根目录执行
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

验证容器状态：

```bash
docker ps | grep blog
# 应看到 blog_backend 和 blog_frontend 均为 Up 状态（非 Restarting）

docker logs blog_backend --tail 20
# 应看到 "Starting blog application" 且无 FATAL 错误
```

### 第五步：配置 OpenResty 反向代理

在 1Panel → 网站 中新建网站，反代目标填 `http://127.0.0.1:3000`，然后在该网站的「配置文件」中追加以下自定义 location：

```nginx
# API 请求直接转发后端，不经过 Next.js
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# 上传文件直接转发后端
location /uploads/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 100m;
    proxy_request_buffering off;
}
```

> **为什么不直接只代理 3000？** 浏览器端 JS 会直接请求 `/api/`，如果没有上面的 location，请求会 404。将 `/api/` 和 `/uploads/` 单独代理到 8080，可以让 OpenResty 直接流式转发，避免文件上传经过 Node.js 造成内存压力。

### 第六步：创建管理员账号

**注册账号：**

```bash
curl -X POST https://your-domain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@your-domain.com",
    "password": "YourPassword123!"
  }'
```

**提升为管理员（注册后默认角色为 reader）：**

```bash
docker exec -it 1Panel-postgresql-XXXX psql -U your_db_user -d blog \
  -c "UPDATE users SET role='admin' WHERE email='admin@your-domain.com';"
```

之后即可登录前台，通过 `/admin` 路径进入后台管理界面。后续新增管理员可在后台「用户管理」中直接修改角色。

---

## 常用运维命令

```bash
# 查看应用日志
docker logs blog_backend -f
docker logs blog_frontend -f

# 重启应用
docker compose -f docker-compose.prod.yml --env-file .env.production restart

# 更新部署（拉取新代码后）
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 停止应用
docker compose -f docker-compose.prod.yml down

# 进入后端容器调试
docker exec -it blog_backend sh
```

---

## 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|:----:|
| `SITE_DOMAIN` | 站点域名，含协议头 | ✅ |
| `POSTGRES_HOST` | PostgreSQL 容器名或 IP | ✅ |
| `POSTGRES_USER` | 数据库用户名 | ✅ |
| `POSTGRES_PASSWORD` | 数据库密码 | ✅ |
| `POSTGRES_DB` | 数据库名，默认 `blog` | ✅ |
| `DB_NETWORK` | 1Panel 网络名，默认 `1panel-network` | ✅ |
| `REDIS_HOST` | Redis 容器名或 IP | ✅ |
| `REDIS_PASSWORD` | Redis 密码 | ✅ |
| `ES_HOST` | Elasticsearch 容器名或 IP | ✅ |
| `JWT_SECRET` | JWT 签名密钥，至少 32 位 | ✅ |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | 邮件配置（评论通知） | ❌ |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth | ❌ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | ❌ |
| `WATERMARK_ENABLED` | 图片水印开关 | ❌ |

---

## 常见问题

**Q: 后端容器一直 Restarting**

查看日志找原因：
```bash
docker logs blog_backend 2>&1 | tail -30
```

常见原因：
- `database "blog" does not exist` → 执行第三步创建数据库
- `connection refused` → `POSTGRES_HOST` 填写的 IP 或容器名不对，检查容器是否在 `1panel-network`
- `JWT_SECRET environment variable is required` → `.env.production` 中 JWT_SECRET 行后有行内注释，删除注释

**Q: 前端页面正常但所有 API 返回 502**

后端容器没有正常运行，参考上一条排查。

**Q: `.env.production` 修改后不生效**

必须加 `--env-file` 参数，且需要重新 build：
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

**Q: 如何备份数据库**

```bash
docker exec 1Panel-postgresql-XXXX pg_dump -U your_db_user blog > backup_$(date +%Y%m%d).sql
```

---

## 打赏支持

<div align="center">
  <p>如果这个项目对你有帮助，可以请我喝杯咖啡 🙏</p>

  <div style="display:inline-block; margin: 0 16px;">
    <img src="./frontend/public/images/donate-wechat.png" alt="微信打赏" width="260" />
    <div>微信打赏</div>
  </div>

  <div style="display:inline-block; margin: 0 16px;">
    <img src="./frontend/public/images/donate-alipay.png" alt="支付宝打赏" width="260" />
    <div>支付宝打赏</div>
  </div>
</div>

---

## 交流沟通

<div align="center">
  <p>使用过程中有任何问题或建议，欢迎加入 QQ 群交流沟通。</p>
  <img src="./frontend/public/images/qqqun.png" alt="QQ 交流群二维码" width="260" />
  <div>QQ 交流群</div>
</div>

---

## 版权说明

为尊重作者的劳动成果，本博客系统页面底部的版权标识请勿擅自删除或隐藏。如确有商业场景或定制需求需要移除版权标识，请先联系开发者获取付费授权。


