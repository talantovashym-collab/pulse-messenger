#!/usr/bin/env bash
# ==============================================================================
# ⚡ Pulse Messenger — One-Click Automated Server Deployment Script
# Supports: Ubuntu, Debian, CentOS, AlmaLinux, RockyLinux, Fedora, Amazon Linux
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}🚀 Starting Pulse Messenger Automated Deployment${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. Verify Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first:${NC}"
    echo "   curl -fsSL https://get.docker.com | sh"
    echo "   sudo usermod -aG docker \$USER"
    exit 1
fi

# 2. Verify Docker Compose is available
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${RED}❌ Docker Compose is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker & Docker Compose verified.${NC}"

# 3. Setup environment configuration (.env)
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        echo -e "${YELLOW}ℹ .env not found. Creating from .env.production...${NC}"
        cp .env.production .env
    else
        echo -e "${YELLOW}ℹ .env not found. Creating from .env.example...${NC}"
        cp .env.example .env
    fi
    echo -e "${GREEN}✓ Created default .env configuration.${NC}"
fi

# 4. Pull base images and build containers
echo -e "${BLUE}🔨 Building and starting Pulse Messenger production stack...${NC}"
$DOCKER_COMPOSE down --remove-orphans || true
$DOCKER_COMPOSE up -d --build

# 5. Wait for application healthcheck
echo -e "${YELLOW}⏳ Waiting for services to become healthy...${NC}"
for i in {1..30}; do
    if curl -s -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Pulse Application is healthy!${NC}"
        break
    fi
    sleep 2
    if [ $i -eq 30 ]; then
        echo -e "${RED}⚠️ Healthcheck timeout. Checking container logs:${NC}"
        $DOCKER_COMPOSE logs pulse-app
    fi
done

# 6. Display running containers status
echo ""
$DOCKER_COMPOSE ps

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}🎉 Pulse Messenger is successfully deployed!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "📱 Web App URL:      ${BLUE}http://localhost (via Nginx Port 80)${NC}"
echo -e "🚀 Direct Node Port: ${BLUE}http://localhost:3000${NC}"
echo -e "📡 Healthcheck:      ${BLUE}http://localhost:3000/api/health${NC}"
echo -e "📜 View live logs:   ${YELLOW}docker compose logs -f${NC}"
echo -e "🛑 Stop stack:       ${YELLOW}docker compose down${NC}"
echo -e "${GREEN}======================================================${NC}"
