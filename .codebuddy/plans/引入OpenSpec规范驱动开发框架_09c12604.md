---
name: 引入OpenSpec规范驱动开发框架
overview: 在当前空项目中引入 OpenSpec 规范驱动开发（SDD）框架，完成初始化配置，使项目具备规范驱动开发能力。
todos:
  - id: check-node-version
    content: 检查 Node.js 版本是否满足 OpenSpec 要求（20.19.0+）
    status: completed
  - id: install-openspec
    content: 全局安装 OpenSpec CLI 工具：npm install -g @fission-ai/openspec@latest
    status: completed
    dependencies:
      - check-node-version
  - id: init-openspec
    content: 在项目目录执行 openspec init 初始化规范驱动开发框架
    status: completed
    dependencies:
      - install-openspec
  - id: verify-structure
    content: 验证 openspec/ 目录结构和配置文件生成完整
    status: completed
    dependencies:
      - init-openspec
---

## 用户需求

在当前空项目中引入 OpenSpec 规范驱动开发框架

## 产品概述

OpenSpec 是一个专为 AI 编码助手设计的规范驱动开发（Spec-Driven Development, SDD）框架。它在编写代码之前，帮助人类和 AI 就"要构建什么"达成一致，通过轻量级规范层实现需求对齐。

## 核心功能

- 初始化 OpenSpec 框架到当前项目
- 生成 openspec/ 规范目录结构
- 配置 AI 指令文件，支持斜杠命令工作流
- 支持核心命令：`/opsx:propose`（提案）、`/opsx:apply`（实施）、`/opsx:archive`（归档）

## 技术栈选择

- **框架**: OpenSpec v1.3.1（Fission-AI 官方版本）
- **运行环境**: Node.js 20.19.0 或更高版本
- **包管理器**: npm（全局安装）

## 实现方案

### 整体策略

通过 npm 全局安装 OpenSpec CLI 工具，然后在项目目录中执行初始化命令，自动生成规范驱动开发所需的目录结构和配置文件。

### 关键技术决策

1. **全局安装方式**: 选择 npm 全局安装，便于在多个项目中复用，且符合官方推荐做法
2. **标准初始化流程**: 使用 `openspec init` 命令自动生成标准目录结构，确保与框架规范一致

## 实现注意事项

- 确保 Node.js 版本满足最低要求（20.19.0+）
- 初始化完成后需验证生成的目录结构完整性
- 配置文件应与当前使用的 AI 编码助手兼容

## 目录结构

初始化完成后，项目将包含以下结构：

```
mps-for-manju/
└── openspec/                    # [NEW] OpenSpec 规范目录，存放所有规范驱动开发相关文件
    ├── changes/                 # [NEW] 变更提案目录，存放当前活动的变更提案
    │   └── archive/             # [NEW] 归档目录，存放已完成的变更历史记录
    ├── .openspec.json           # [NEW] OpenSpec 配置文件，定义项目级别的 SDD 配置
    └── instructions/            # [NEW] AI 指令目录，包含斜杠命令定义和工作流配置
```