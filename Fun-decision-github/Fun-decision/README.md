# 一念一卦 · Fun-decision

一个古风国漫风格的互动问卦小游戏：心里想着一件事，从六十四张在山河间飞舞的卦牌里亲手拈出一张，看它翻面，得到一段温和、带行动建议的解读。

支持**摄像头手势**（全部在本机识别，不上传画面），也可以完全用**鼠标 / 触屏 / 键盘**游玩。

> 娱乐体验，仅作自我观察与灵感参考，重要决定请依据事实与专业建议。

## 玩法

1. **连接手势**：举起一只手让摄像头识别；没有摄像头就点「暂用鼠标继续」。
2. **择一事**：六张主题牌（姻缘感情、学业考试、事业工作、财运机会、人际关系、近期综合）。
3. **拈牌**：六十四张暗牌在风里飘，拈起、甩出、选中其中一张。
4. **翻牌解读**：选中的牌飞到面前翻开，给出卦名、卦爻和解读。

| 操作 | 手势 | 鼠标 / 触屏 | 键盘 |
| --- | --- | --- | --- |
| 选主题牌 | 指尖指向，捏合保持 2 秒 | 点击 | `1`–`6` |
| 拈起一张牌 | 拇指食指捏合 | 按住牌 | — |
| 甩出 | 捏住后快速挥动再松开 | 拖动后松开 | — |
| 定下这张牌 | 捏住不动 2 秒 | 按住不动 1.2 秒 | — |
| 起风乱牌 | 张开手掌 | 「挥手乱卦」按钮 | `空格` |
| 随缘定卦 | 握拳 | 「握拳定卦」按钮 | `回车` |
| 重新开始 | — | 点左上角标题 | `Esc` |

右上角「声 / 静」可以开关音效（设置会被记住）。浏览器要求先有一次点击或按键才能发声。

## 特点

- **真实的卡牌物理**：每张牌都是有质量、惯性和转动的刚体；从哪里捏住就绕哪里摆动，甩出去会带着速度飞走，远近有景深和视差。
- **合成音效**：拈牌、甩牌、起风、翻牌、定卦的铜磬声，全部用 Web Audio 实时合成，无需音频文件。
- **本地手势识别**：基于 MediaPipe Gesture Recognizer，模型文件随项目提供，识别在浏览器本地完成。

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

1. 在 GitHub 新建一个仓库（例如 `Fun-decision`），不要勾选添加 README。
2. 上传代码，二选一：
   - **网页上传**：打开仓库页面 → `Add file` → `Upload files`，把解压后文件夹**里面的全部内容**（包括 `.github` 文件夹）拖进去 → `Commit changes`。
   - **命令行**：
     ```bash
     git init
     git add .
     git commit -m "一念一卦"
     git branch -M main
     git remote add origin https://github.com/<你的用户名>/<仓库名>.git
     git push -u origin main
     ```
3. 仓库 `Settings` → `Pages` → `Build and deployment` → `Source` 选择 **GitHub Actions**。
4. 打开 `Actions` 标签页，等待「Deploy to GitHub Pages」跑完（约 1–2 分钟；如果第一次在第 3 步之前就跑失败了，点进去 `Re-run all jobs` 即可）。
5. 访问 `https://<你的用户名>.github.io/<仓库名>/` 即可在线游玩，之后每次推送到 `main` 都会自动更新。

## 目录结构

```
src/
  App.jsx          页面流程、手势与指针输入
  cardPhysics.js   六十四张牌的刚体物理（风场、抓取弹簧、投掷、收卦动画）
  sound.js         Web Audio 合成音效
  hexagrams.js     六十四卦数据与卦爻计算
  styles.css       全部样式
public/
  assets/          背景、牌面、牌背、云幕等图片
  models/          手势识别模型 gesture_recognizer.task
design/            视觉参考图
.github/workflows/ GitHub Pages 自动部署
worker/ scripts/ tests/ .openai/   可选的 Sites 托管打包（npm run build 会一并生成）
```

## 隐私

摄像头画面只在你的浏览器里用于识别手势，不会显示、保存或上传。手势识别的 WebAssembly 运行库从 jsDelivr CDN 加载。
