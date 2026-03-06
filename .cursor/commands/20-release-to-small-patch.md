# Release as Small Patch

执行小补丁版本发布，使用 `standard-version` 自动更新版本号、生成 CHANGELOG 并创建 git tag。

## 命令

```bash
npm run release:patch
```

## 工作流程

1. **检查当前状态**
   - 确认所有变更已提交（`git status`）
   - 确认当前分支是发布分支（通常是 `main` 或 `master`）

2. **执行发布**
   - 运行 `npm run release:patch`
   - `standard-version` 会：
     - 根据 Conventional Commits 自动确定版本号（patch 版本）
     - 更新 `package.json` 中的版本号
     - 生成/更新 `CHANGELOG.md`
     - 创建 git commit 和 tag

3. **推送变更**
   - 推送代码：`git push`
   - 推送标签：`git push --follow-tags` 或 `git push origin --tags`

## 版本号规则

- **Patch (0.2.10 → 0.2.11)**: 修复 bug，向后兼容
- **Minor (0.2.10 → 0.3.0)**: 新功能，向后兼容
- **Major (0.2.10 → 1.0.0)**: 破坏性变更

## 注意事项

- 确保所有变更已提交到 git
- 确保遵循 Conventional Commits 规范（commitlint 会验证）
- 发布后记得推送代码和标签到远程仓库
- 如果需要撤销，可以使用 `git reset --hard HEAD~1` 和删除 tag
