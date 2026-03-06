# Commit to GitHub

帮助用户将代码变更提交并推送到 GitHub，遵循 Conventional Commits 规范。

## 工作流程

1. **检查 Git 状态**
   - 运行 `git status` 查看当前状态
   - 确认是否有未提交的变更

2. **查看变更内容**
   - 运行 `git diff` 查看已修改的文件
   - 运行 `git diff --cached` 查看已暂存的文件
   - 分析变更类型和范围

3. **暂存文件**
   - 根据变更内容，使用 `git add` 暂存相关文件
   - 如果用户没有明确指定，询问是否需要暂存所有变更

4. **创建提交信息**
   - 遵循 Conventional Commits 规范：`<type>(<scope>): <subject>`
   - **类型 (type)**:
     - `feat`: 新功能
     - `fix`: 修复 bug
     - `docs`: 文档变更
     - `style`: 代码格式（不影响代码运行）
     - `refactor`: 重构
     - `perf`: 性能优化
     - `test`: 测试相关
     - `chore`: 构建过程或辅助工具的变动
     - `build`: 构建系统或外部依赖的变更
     - `ci`: CI 配置文件和脚本的变更
   - **范围 (scope)**: 可选，表示影响的范围（如 `electron`, `renderer`, `api`）
   - **主题 (subject)**: 简短描述，使用祈使语气，不超过 50 字符，首字母小写，末尾不加句号
   - **正文 (body)**: 可选，详细说明变更原因和内容，每行不超过 100 字符（建议 72 字符）

5. **提交变更**
   - 使用 `git commit -m "提交信息"` 提交
   - 如果提交信息较长，使用 `git commit -F` 从文件读取

6. **推送到 GitHub**
   - 运行 `git push` 推送到远程仓库
   - 如果当前分支没有设置 upstream，使用 `git push -u origin <branch-name>`

## 提交信息示例

```
feat(clipboard): add /info endpoint for health check

Add GET /clipboard/info endpoint to provide simple service status
check. Returns {"status": "ok", "service": "clipboard"} when service
is ready or in warning state, otherwise returns 503.

This endpoint is useful for monitoring and quick health checks.
```

```
fix(http-server): resolve missing clipboard info endpoint

The /clipboard/info endpoint was missing from the HTTP server routes
after migration from backend project. This commit adds the endpoint
with the same logic as the backend implementation.
```

## 注意事项

- **提交前检查**: 确保没有敏感信息（密码、密钥等）被提交
- **原子性提交**: 每次提交应该是一个逻辑完整的变更
- **冲突处理**: 如果存在合并冲突，先解决冲突再提交
- **分支确认**: 确认当前在正确的分支上
- **代码质量**: 项目使用 Husky 和 lint-staged，提交前会自动运行 lint 和 format
- **提交信息语言**: 提交信息使用英文（遵循国际标准）

## 错误处理

- 如果不是 git 仓库，提示用户
- 如果没有变更可提交，通知用户
- 如果推送失败，检查远程仓库配置和网络连接
- 如果提交信息不符合规范，commitlint 会拒绝，需要修正后重试
