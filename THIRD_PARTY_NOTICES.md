# 第三方资源与许可

根目录的 MIT 许可证适用于本项目原创代码。第三方软件、字体、插画、录音和音乐的权利由各自权利人保留；将文件收录进仓库不改变其原有许可，也不代表它们自动获得 MIT 授权。

## 软件依赖

| 依赖 | 许可 | 官方来源 |
| --- | --- | --- |
| Phaser | MIT | https://github.com/phaserjs/phaser |
| Vite | MIT | https://github.com/vitejs/vite |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Node.js 类型声明 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

具体安装版本和传递依赖见 `package-lock.json`，相关许可证随 npm 依赖提供。

## 游戏资源

`public/` 包含启动画面、图标、体力素材，以及 `public/assets/manifest.json` 登记的牌面、武将插画、卡背、牌桌背景、字体、语音和音乐。

- 军争牌图与语音来自本地三国杀素材集；骅骝完整牌面由用户提供，源图保存在 `public/ui/card-art/hualiu.png`，插画仍属于相应权利人。
- 卡牌、武将插画和游戏配音采用现有三国杀素材，仍属于相应原权利人。本仓库目前没有附带这些文件的再分发授权证明，不能据此宣称可自由商用或再分发。
- `public/assets/fonts/wenq.ttf` 的文件内名称为“方正隶变_GBK / FZLiBian-S02”，版权记录为“Founder Corporation.1999”。仓库没有附带字体再分发授权证明；项目的 MIT 许可证不代替字体授权。
- 启动画面、图标和阴阳鱼体力素材是为本项目生成的视觉资源；它们与第三方牌面、插画和录音分别管理。

如需公开分发完整资源包，应取得对应资源的再分发许可，或换用已获授权的替代资源。代码可以按 MIT 使用，素材的使用和再分发需分别确认。
