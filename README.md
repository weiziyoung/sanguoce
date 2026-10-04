# sanguoce · 三国策

三国策是一款使用 TypeScript 开发的策略卡牌游戏，提供浏览器与终端客户端。规则引擎、内容包和 AI 策略可独立扩展，两种客户端共用对局逻辑。

当前支持：

- 1v1 对决、五人身份局与标准篇 25 名武将。
- 浏览器选将、拖放出牌、技能与装备交互、动画和音效。
- 本地保存的声音、速度和显示设置。
- 对局结算、战绩统计与完整轨迹保存。
- 默认规则 AI，以及 CLI 可选的模型策略接口。

## 快速开始

需要 Node.js 24 或更高版本及 npm。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址即可进入游戏。网页素材已随仓库收录在 `public/`，普通启动和构建直接使用现有文件，不要求额外的素材目录。

终端客户端：

```sh
npm run play
npm run play -- --mode duel --seed 7
npm run play -- --mode identity --seed 7
```

网页支持 `?mode=duel&seed=7` 或 `?mode=identity&seed=7`，可固定开局种子。

## 操作

点击或拖动手牌选择出牌，再选择目标；技能按钮会显示当前可执行的技能。需要选择装备费用或弃置坐骑时，直接操作中央牌桌上的原牌。多选费用选满后点击确认，右键或 Esc 撤销选择。

右上角“设置”可调整音量、静音、动画速度、战斗记录与提示。设置保存在当前浏览器的本地存储中。

## 构建与验证

```sh
npm run typecheck
npm test
npm run build
npm run serve:web
```

构建产物位于 `dist/`。开发服务器和预览服务器提供同源 `/api/web-games`，对局结束后自动将轨迹保存到 `traces/web/`。部署到纯静态服务器时，轨迹保存接口需另外提供；保存失败时结算页可下载 JSON。

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

const game = GameEngine.standard({ seed: 7 });
const observation = game.getObservation(0);
const decision = game.getDecision();
```

内容定义位于 `src/content/`，对局内核位于 `src/core/`，通用规则位于 `src/rules/`，模式位于 `src/modes/`。策略实现 `DecisionPolicy`，只读取当前角色可见的局面并返回合法行动 ID。浏览器客户端位于 `src/web/`。

## 参与开发

提交变更前运行类型检查、相关测试和网页构建。新增规则或技能请同时提供实际结算场景的测试；新增素材请说明来源与许可。

## 许可

原创代码使用 [MIT 许可证](./LICENSE)，允许使用、修改、分发和商业使用，分发时须保留版权与许可声明。第三方软件和游戏素材适用各自的许可，详见 [第三方资源说明](./THIRD_PARTY_NOTICES.md)。
