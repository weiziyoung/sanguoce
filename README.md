# sanguoce · 三国策

三国策是一款使用 TypeScript 开发的策略卡牌游戏，提供浏览器与终端客户端。规则引擎、内容包和 AI 策略可独立扩展，两种客户端共用对局逻辑。

[在线试玩](https://weiziyang.wiki/sanguoce)

当前支持：

- 1v1 对决、五人身份局与标准篇 25 名武将。
- 默认标准 108 张牌，可选加入军争 52 张，组合为 160 张牌堆。
- 浏览器选将、拖放出牌、技能与装备交互、动画和音效。
- 本地保存的声音、速度和显示设置。
- 对局结算、战绩统计与完整轨迹保存。
- 默认规则 AI；网页可选 Jev 或兼容 OpenAI 的 Chat 接口，CLI 可选 Jev 或本地 Laya。

## 快速开始

需要 Node.js 24 或更高版本及 npm。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址即可进入游戏。开局页可选“标准”或“标准＋军争”，两种牌包均可进入对决或五人身份局。网页素材已随仓库收录在 `public/`，普通启动和构建直接使用现有文件，不要求额外的素材目录。

终端客户端：

```sh
npm run play
npm run play -- --mode duel --seed 7
npm run play -- --mode identity --seed 7
npm run play -- --cards junzheng  # 标准＋军争；默认仅使用标准牌堆
```

网页支持 `?mode=duel&seed=7` 或 `?mode=identity&seed=7`，可固定开局种子；默认标准牌包，添加 `&cards=junzheng` 可启用军争。重开、再来一局保留所选模式和牌包，并重新随机种子。

## 操作

点击或拖动手牌选择出牌，再选择目标；技能按钮会显示当前可执行的技能。需要选择装备费用或弃置坐骑时，直接操作中央牌桌上的原牌。多选费用选满后点击确认，右键或 Esc 撤销选择。

铁索连环可选择一或两个目标，也可直接重铸；火攻由目标展示一张手牌，再由使用者选择同花色手牌弃置或放弃。画像上的“连环”和“酒+1”显示公开状态。

右上角“设置”可调整音量、静音、动画速度、战斗记录与提示。设置保存在当前浏览器的本地存储中。

## 电脑 AI 配置

“设置 → 电脑 AI”默认使用规则策略，也可选择以下两种接口；所选方式用于全部电脑，关闭设置后从下一次决策生效：

- **Jev 接口**：默认地址 `https://api.typesafe.ai/v1/systemone`、模型 `jev-latest`，填写自己的 API Key；也可填写其他 Jev / systemone 兼容服务的完整请求地址和模型名。
- **Chat 接口**：填写兼容 [Chat Completions 规范](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)的完整请求地址（如 `https://你的服务/v1/chat/completions`）、模型名和可选 API Key。

点击“测试连接”会发送一次示例决策，并显示合法响应与耗时。真实对局只发送当前电脑可见的局面和合法行动；唯一合法行动跳过模型请求。模型思考期间对局等待，请求失败可重试或修改 AI 设置，不会自动改用规则策略。

两个接口的地址、模型分别保存；API Key 只放在当前标签页的会话存储中，刷新／重开可保留，关闭标签页后清除，浏览器禁用会话存储时仅留在当前页面内存。密钥不写入对局轨迹。Jev 官方地址通过同源 `/api/ai/jev` 转发，开发、预览与生产服务均提供该接口；自定义地址由浏览器直接调用，需要允许跨域访问，HTTPS 页面应使用 HTTPS 接口。纯静态托管需自行提供 Jev 官方转发接口。

## 构建与验证

```sh
npm run typecheck
npm test
npm run serve:web
```

本地预览会自动构建到 `dist-preview/`，开发与预览均从本机加载资源，不使用生产 OSS 配置。`npm run build` 生成用于部署的 `dist/`，两个构建目录互不覆盖。开发服务器和预览服务器提供同源 `/api/web-games`，对局结束后自动将轨迹保存到 `traces/web/`。部署到纯静态服务器时，轨迹保存接口需另外提供；保存失败时结算页可下载 JSON。

部署到子路径并使用 OSS/CDN：

```sh
SANGUOCE_BASE_PATH=/sanguoce/ SANGUOCE_ASSET_BASE_URL=https://your-cdn.example/sanguoce/releases/v1/ npm run build
```

将 `dist/` 静态文件上传到该资源前缀，允许游戏网站来源的跨域 GET/HEAD 请求。入口页面及 `/sanguoce/api/web-games` 仍由游戏网站提供；资源清单中的图片和语音会自动使用 CDN 前缀。每次发布使用新前缀，避免缓存混用旧版本。

`npm start` 启动独立生产服务，提供页面、健康检查、轨迹保存和 Jev 官方接口转发。使用 `deploy/Dockerfile` 与 `deploy/docker-compose.yml` 时，将游戏容器加入反向代理所在的 Docker 网络，准备可写的 `traces/` 目录，再让代理去掉 `/sanguoce` 前缀后转发至游戏端口 8080。环境变量示例见 `.env.example`；轨迹目录应放在静态目录外，不能公开访问。

CLI 轨迹与中文报告：

```sh
npm run demo -- --mode identity --seed 7 --dump ./traces/game-7.json
npm run report -- ./traces/game-7.json ./traces/game-7.md
```

完整轨迹可能包含隐藏手牌和身份，只用于回放与调试，不应作为玩家或策略的观察输入。

## 扩展接口

通过 `index.ts` 导入公开接口：

```ts
import { GameEngine } from './index.ts';

const game = GameEngine.junzheng({ seed: 7 }); // 标准 + 军争
// GameEngine.standard({ seed: 7 }) 使用标准 108 张牌。
const observation = game.getObservation(0);
const decision = game.getDecision();
```

内容定义位于 `src/content/`，对局内核位于 `src/core/`，通用规则位于 `src/rules/`，模式位于 `src/modes/`。策略实现 `DecisionPolicy`，只读取当前角色可见的局面并返回合法行动 ID。浏览器客户端位于 `src/web/`。

## 参与开发

提交变更前运行类型检查、相关测试和网页构建。新增规则或技能请同时提供实际结算场景的测试；新增素材请说明来源与许可。

## 许可

原创代码使用 [MIT 许可证](./LICENSE)，允许使用、修改、分发和商业使用，分发时须保留版权与许可声明。第三方软件和游戏素材适用各自的许可，详见 [第三方资源说明](./THIRD_PARTY_NOTICES.md)。
