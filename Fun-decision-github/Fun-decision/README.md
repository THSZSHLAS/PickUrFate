# 一念一卦 · Fun-decision

一个古风国漫风格的互动问卦小游戏：心里想着一件事，从六十四张在山河间飞舞的卦牌里亲手拈出一张，看它翻面，得到一段温和、带行动建议的解读。

支持**摄像头手势**（全部在本机识别，不上传画面），也可以完全用**鼠标 / 触屏 / 键盘**游玩。

> 娱乐体验，仅作自我观察与灵感参考，重要决定请依据事实与专业建议。

## 玩法

1. **连接手势**：举起一只手让摄像头识别；没有摄像头就点「暂用鼠标继续」（手机上是「用触屏继续」）。
2. **择一事**：选择起卦方式，写下想问的事（可选），再从六张主题牌里选一张。
3. **拈牌 / 起卦**：
   - **快速抽卦**：六十四张暗牌在风里飘，拈起、甩出，按住一张不动即定卦。
   - **六爻起卦**：每次拈一张牌**向上甩进爻台**（或按住不动、或点「落爻」），按三钱法落下一爻；六爻落满自动成卦，出现老阳 / 老阴时会有**变爻与之卦**。
4. **翻牌解读**：卦牌飞到面前翻开，给出卦名、卦辞、象辞、白话释义、针对所问类别的解读、变爻提示；接入 AI 后还有结合你问题的**深度解读**。
5. **分享海报**：一键生成带卦象、问题、解读和二维码的竖版海报，可保存或分享。

| 操作 | 手势 | 鼠标 / 触屏 | 键盘 |
| --- | --- | --- | --- |
| 选主题牌 | 指尖指向，捏合保持 2 秒 | 点击 | `1`–`6` |
| 拈起一张牌 | 拇指食指捏合 | 按住牌 | — |
| 甩出 | 捏住后快速挥动再松开 | 拖动后松开 | — |
| 定卦（快速）/ 落爻（六爻） | 捏住不动 2 秒 | 按住不动 1.2 秒 | `回车` |
| 六爻：甩进爻台 | 捏住向上一甩 | 按住向上一甩 | — |
| 起风乱牌 | 张开手掌 | 「挥手乱卦」按钮 / 手机摇一摇 | `空格` |
| 牌潮倾泻 | — | 倾斜手机 | — |
| 重新开始 | — | 点左上角标题 | `Esc` |

右上角「声 / 静」可以开关音效（设置会被记住）。浏览器要求先有一次点击或按键才能发声；苹果手机第一次点击时会询问是否允许使用「运动与方向」。

## 特点

- **真实的卡牌物理**：每张牌都是有质量、惯性和转动的刚体；从哪里捏住就绕哪里摆动，甩出去会带着速度飞走；六十四张牌在一块画布上渲染，手机也流畅。
- **六十四卦完整释义**：每卦包含《周易》卦辞、大象（象曰）、白话释义、关键词，以及姻缘 / 学业 / 事业 / 财运 / 人际五类所问的具体建议。
- **六爻起卦**：三钱法（老阴 1/8、少阳 3/8、少阴 3/8、老阳 1/8），自动计算本卦、变爻与之卦。
- **AI 深度解读（可选）**：接入 DeepSeek 等兼容 OpenAI 格式的接口，结合你的问题、本卦、变爻与之卦流式生成解读。
- **分享海报**：纯前端绘制，自带二维码（无需第三方库）。
- **合成音效**与**本地手势识别**：音效实时合成；手势识别在浏览器本地完成，模型文件随项目提供。

## 接入 DeepSeek（AI 深度解读）

三种方式任选其一：

1. **页面里填写（最简单）**：结果页「AI 细解」→「接入 DeepSeek」→ 填 API Key → 保存。Key 只保存在当前浏览器，别人看不到。默认接口 `https://api.deepseek.com`，模型 `deepseek-flash`，可在同一面板修改。
2. **构建时内置（所有访客都能直接用）**：仓库 `Settings` → `Secrets and variables` → `Actions`：
   - Secrets 新增 `DEEPSEEK_API_KEY`；
   - （可选）Variables 新增 `AI_MODEL`、`AI_BASE_URL`。
   重新运行部署即可。⚠️ 这样 Key 会被打包进网页 JS，任何访客都能看到并使用你的额度——务必在 DeepSeek 后台设置用量上限。
3. **自建代理（推荐公开分享时使用）**：把 `proxy/deepseek-proxy.js` 部署为 Cloudflare Worker，Key 存在 Worker 的环境变量里；然后把 `AI_BASE_URL` 设为 Worker 地址、不设 Key。文件开头有部署说明。

如果页面提示「连不上 AI 接口」，可能是网络问题或接口不允许网页直接跨域调用，改用方式 3 即可。

## 本地运行

需要 [Node.js](https://nodejs.org/) 20 或更高版本。

```bash
npm install
npm run dev
```

打开终端里显示的地址（通常是 http://localhost:5173/）。摄像头只能在 `localhost` 或 HTTPS 页面上使用。

构建正式版本：

```bash
npm run build      # 输出到 dist/client
npm run preview    # 本地预览构建结果
```

## 上传到 GitHub 并在线游玩（GitHub Pages）

> 本项目必须经过构建才能在网页上运行，所以 Pages 要用 **GitHub Actions** 发布，不能用「Deploy from a branch」直接发布源码（那样会 404）。

1. 在 GitHub 新建仓库，把项目文件上传上去（放在仓库根目录或子文件夹里都可以）。
2. **添加自动发布脚本**（网页上传会自动跳过以 `.` 开头的文件夹，所以 `.github` 需要手动建）：
   仓库首页 → `Add file` → `Create new file` → 文件名一栏输入 `.github/workflows/deploy-pages.yml` → 把本项目里同名文件的内容粘贴进去 → `Commit changes`。
   用 `git push` 上传的话这个文件会自动带上，可跳过这一步。
3. 仓库 `Settings` → `Pages` → `Build and deployment` → `Source` 选择 **GitHub Actions**。
4. 打开 `Actions` 标签页，等「Deploy to GitHub Pages」变成绿色对勾（约 1–2 分钟）。如果它在第 3 步之前就跑失败了，点进去选 `Re-run all jobs`。
5. 访问 `https://<你的用户名>.github.io/<仓库名>/`（注意末尾的斜杠）。之后每次提交到 `main` 都会自动更新。

用命令行上传：

```bash
git init
git add .
git commit -m "一念一卦"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

## 目录结构

```
src/
  App.jsx          页面流程、手势与指针输入
  ResultStage.jsx  结果页：翻牌、释义、AI 细解、分享海报
  cardPhysics.js   六十四张牌的刚体物理（风场、抓取弹簧、投掷、落爻、收卦动画）
  cardRenderer.js  单画布渲染六十四张牌
  hexagrams.js     六十四卦数据、卦爻与三钱法计算
  hexagramTexts.js 六十四卦卦辞、象辞、白话与分类解读
  ai.js            DeepSeek / OpenAI 兼容接口的流式调用与提示词
  poster.js        分享海报绘制
  qrcode.js        二维码生成
  motion.js        手机倾斜与摇一摇
  sound.js         Web Audio 合成音效
  styles.css       全部样式
public/
  assets/          背景、牌面、牌背、云幕等图片
  models/          手势识别模型 gesture_recognizer.task
design/            视觉参考图
proxy/             可选的 DeepSeek 代理（Cloudflare Worker）
.github/workflows/ GitHub Pages 自动部署
worker/ scripts/ tests/ .openai/   可选的 Sites 托管打包（npm run build 会一并生成）
```

## 隐私

摄像头画面只在你的浏览器里用于识别手势，不会显示、保存或上传。手势识别的 WebAssembly 运行库从 jsDelivr CDN 加载。只有在你接入 AI 后，所问类别、你写下的问题和卦象信息才会发送给你配置的 AI 接口。
