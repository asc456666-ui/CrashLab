# 碰撞实验场二代 2.0.0

- 应用名称：碰撞实验场二代
- Android application ID：`com.crashlab.game2`
- versionCode：2；versionName：2.0.0
- 安装包：`CrashLab2-v2.0.0.apk`，3449780 字节
- SHA256：`db4773f72827e3ae9b8940b2700a0c651a10c7d25f9daa015b7bd67c00e3915d`
- 最低 Android 7.0，横屏、离线运行，无网络权限或敏感运行时权限。AndroidX 自动生成的应用内部签名权限不需要用户授权。

本版包含自由地图扩建、高速双传送门、生物岛、42 辆工程与电动车组成的工地岛；全世界 66 辆场景车随机巡游，动物可走、跑、跳、坐卧。飞坡离地助推、双击油门空中特技；漂移改为渐进抓地调整，取消遮挡两侧气流及强制车身旋转，并加入车身与轮子插值。设置和后台返回始终重新验证密码。建筑破坏保留，换车仅恢复落锤，地图可单独重置建筑。

## 安装与签名

一代发布证书的私钥未在当前环境找到。二代使用独立应用标识与发布签名，可和一代同时安装，不会清除一代数据。二代初始密码仍为 `456321`，首次运行采用自己的设置与进度。

发布签名的证书 SHA256：`c4384cc5fd991339b85226d7884a93f6a4317f4a2214f46ae21765fe9a9c629d`。私钥 `android/crashlab-v2.keystore` 和 `android/keystore.properties` 仅本地保留，已由 Git 忽略；以后给二代升级必须继续使用此签名。

## 构建与验收

1. `npm ci`，`npm test`，`npm run build`，`npx cap sync android`。
2. 配置本机 JDK 21、Android SDK、本地签名与 SDK 路径，运行 `android/gradlew.bat assembleRelease`。
3. 使用 Android SDK 的 `apksigner verify --verbose --print-certs`、`aapt dump badging` 和 `aapt dump permissions` 检查签名、版本及权限。
4. 包内 `assets/public` 与网页构建逐文件一致。解出此目录后运行 `node test/release-check.cjs 解出的目录`，检查断网选车、驾驶和无外部请求。

本版发布前 45 项回归测试通过，浏览器验证覆盖实际驾驶、双岛往返、碰撞、漂移与手机地图。APK 签名、版本、名称与包内资源一致性检查通过。Android 真机帧率和触摸手感仍需实际手机确认。
