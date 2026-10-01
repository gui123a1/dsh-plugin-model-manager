# dsh-plugin-model-manager

DeepSeek Harness 的本地（树外）插件：给**模型供应商**加一个"启用/禁用"开关，被禁用的供应商其模型不再出现在**对话窗口的模型选择列表**里；同时在模型选择浮层底部加一个**模型设置**快捷入口。

- 插件 ID / loader 行 id：`model-manager`
- 包名：`dsh-plugin-model-manager`
- 形态：正式组合包（bundle）——`package.json` 声明 `dsh.bundle.patch` 与 `dsh.client`，profile 以 pnpm `link:` 依赖装入
- 不发布到 npm，仅本机使用


## 目录结构

```
dsh-plugin-model-manager/
├── package.json        # 包元信息 + dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml    # 组合包补丁：insert 插件行（id: model-manager）
├── index.mjs           # Host 半侧：Config 命名空间 + 模型目录过滤
├── client.js           # 浏览器半侧：供应商开关 + 悬浮面板快捷入口
├── node_modules/       # 仅 2 个自带的运行时依赖（见下）
│   └── @deepseek-ai/{schemastery,cosmokit}
└── README.md
```

## 两个功能

### 1. 供应商启用开关（模型设置页，每张供应商卡片一个）

- 注册进 `settings.models.provider-card`。该槽位是 **keyed** 槽位，key 是供应商的 `settingsNs`（对 pi-ai 路由来说就是 loader 行 id，例如 `llm-pi-ai`），所以**一次注册**就服务该命名空间下的每一张供应商卡片（同一命名空间下的多张卡片共用同一个 key）。
- 开关状态存在 Host 设置文档里：`model-manager` 命名空间的 `disabled` 数组（供应商 id 列表）。客户端通过现成的 `remote.settings.describe()` / `remote.settings.mutate()` 读写，没有自定义 Remote 命名空间。
- 写入落在 profile 的用户补丁层（`~/.dsh/profiles/desktop/cordis.patch.yml`），重启后仍在：

  ```yaml
  - id: model-manager
    config:
      disabled:
        - my-provider
  ```

### 2. 模型设置快捷入口（模型选择浮层底部）

模型选择器（composer 里的模型药丸）**渲染自己的下拉菜单**：`dsh-client-ui-model-selection` 用 `createPortal` 把一个 `MenuSurface` 直接挂到 `document.body`，并不声明任何子槽位；键入 `/model` 时的 popupSelect 外壳则是另一个 `MenuSurface`。所以这一行 footer 以 DOM 方式挂到**当前打开的那个浮层**上：

- **识别**：`MenuSurface` 根节点自带 `data-menu-material="translucent"`，两个浮层的 `aria-label` 分别是各自包发布的文案——药丸下拉是 `model` 命名空间的 `menu.aria`（「模型与推理等级」），`/model` 外壳是 `command` 命名空间的 `overlay.aria`（「/model 选项」）。插件用**同一份字典**取这两个文案（另有内置中英兜底），匹配到的浮层就是模型选择器。
- **挂载与摘除**：`document.documentElement` 上的一个 `MutationObserver`（childList + `aria-expanded` 属性，rAF 合并）在浮层出现时把 footer 追加为浮层最后一个子节点，浮层关闭时移除；另有一个针对浮层自身的 childList observer，保证它在切换「模型／推理等级」面板、React 追加新兄弟节点后仍是最后一个。
- **点击**：先向浮层派发一个 `Escape`（沿 React 树冒泡到药丸自己的按键处理，收起浮层），再打开内置设置对话框的「模型」分区。

## 禁用语义（重要）

"禁用"只影响**选择器的展示**，不影响其它任何东西：

| 行为 | 是否受影响 |
|---|---|
| 对话窗口的模型选择列表 | ✅ 隐藏该供应商的全部模型 |
| 模型设置页的供应商卡片 | ❌ 仍在（开关要继续可点） |
| 已有会话/默认模型指向该供应商的模型 | ❌ 照常可用 |
| `llm` 注册表、真实请求、`sessionAvailable` 校验 | ❌ 不变 |

实现方式：Host 侧包装 `sessionController.modelCatalog()`（浏览器取模型目录的唯一来源），从返回的 `groups` / `failures` / `routableProviders` 里剔除被禁用的供应商。dsh 0.2.0-rc.1 **没有**为"收窄模型目录"提供 seam：`llm` seam 只注册适配器，全部 waterfall 事件里也没有目录事件。因此这里用文档化的 `ctx.inject(['sessionController'])` 取到服务、包装其原型方法，并在插件卸载时原样还原。**这是本插件唯一一处非声明式扩展点**，其余全部走官方 API。

### 例外：`deepseek-account`

官方账号供应商不提供开关（渲染为禁用状态的开关并给出说明）。原因：模型设置页是从**同一份模型目录**判断账号供应商那一行该不该显示的，禁用它会连带隐藏它自己的开关行，形成死锁。

## 存档位置

- 供应商启用状态：设置文档（`model-manager.disabled`），最终写入 profile 的用户补丁层。
- 插件自带运行时依赖（`node_modules/@deepseek-ai/{schemastery,cosmokit}`）：**故意放在插件目录里**。树外插件的模块解析走 realpath，从插件源码目录出发走不到 profile 的 `node_modules`，所以 `import z from "@deepseek-ai/schemastery"` 默认无法解析；把这两个包随插件携带，插件就与全局安装解耦、可整目录搬走（合计约 140 KB，cosmokit 无运行时依赖，`@standard-schema/spec` 仅类型）。

## 安装方式（当前生效）

1. **组合包声明**：`package.json` → `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，补丁内容为：

   ```yaml
   - insert:
       - id: model-manager
         name: dsh-plugin-model-manager
   ```

2. **profile 依赖（link 模式）**：`~/.dsh/profiles/desktop/package.json`

   ```json
   "dependencies": {
     "dsh-plugin-model-manager": "link:<本仓库所在目录>"
   },
   "dsh": { "profile": { "bundles": [
     "@deepseek-ai/dsh-base",
     "@deepseek-ai/dsh-web-app",
     "dsh-web-search-tavily",
     "dsh-plugin-model-manager"
   ] } }
   ```

   然后在 `~/.dsh/profiles/desktop` 执行一次 `pnpm install`，生成指向源码目录的 junction。

3. **重启桌面端**。desktop profile 没有 live reload，改代码后同样需要重启。

### 回滚

1. `profiles/desktop/package.json`：删除 link 依赖与 bundles 里的 `dsh-plugin-model-manager`；
2. 在 `profiles/desktop` 再跑一次 `pnpm install`（或直接删除 `node_modules\dsh-plugin-model-manager` junction）；
3. 可选：从 `profiles/desktop/cordis.patch.yml` 删掉 `- id: model-manager` 那一段；
4. 重启应用。

## 已知限制

- **供应商卡片里的开关位置**：`settings.models.provider-card` 的渲染点是供应商卡片头部（名称 + 编辑/删除）**之后**的一个整行，无法插进 `编辑` 按钮所在的那条 flex 行。因此开关以"开关 + 说明"一行呈现在卡片内、头部下方。
- **快捷入口的宿主是 DOM**：模型药丸的下拉由 `dsh-client-ui-model-selection` 自己 portal 到 `document.body`，没有子槽位可用，footer 只能作为 DOM 子节点追加、并用 MutationObserver 保持在末位（React 只会 `appendChild` 自己的节点，不会重排它）。识别依赖浮层的 `aria-label` 与 `MenuSurface` 的 `data-menu-material` 标记；上游若改掉这两者，这里需要跟着改。
- **改代码后需重启**：desktop profile 不支持客户端半侧的 HMR。
- 打开设置分区依赖 `sidebar.settings` 槽位的 root store 席位：`ctx.slots.entries('sidebar.settings')` 取条目，**席位在条目自身的 `entry.store` 上**（`options` 里只有 `key/id/order/label/priority`——这是 0.2.0-rc.1 `dsh-client-ui-slots` 的 SlotCore 布局，渲染器也读 `entry.store`），再调 `handle.create().actions.openSection('models')`。槽位账本是公开的，但设置外壳 store 的形状属于实现细节，dsh 换版本时请复核；找不到席位时插件会打印 `no settings shell store among N entries`。
