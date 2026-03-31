# 雷霆裂空 Thunder Force

竖版射击游戏，纯 Canvas + JS 实现。

## 运行方式

直接用浏览器打开 `index.html` 即可（需要本地 HTTP 服务，否则图片素材可能加载失败）。

```bash
npx serve .
```

## 游戏说明

- **移动**：WASD / 方向键 / 触摸拖动
- **开火**：自动，鼠标左键切换开关
- **雷压**：击杀敌人积累，满100%触发8秒雷暴（无敌+四列子弹）

## 关卡设计

| Wave | 内容 |
|------|------|
| 1 | S曲线入场，5架普通敌机 |
| 2 | 正三角阵型，10架（普通+精英） |
| 3 | 蛇形Boss，7节身体独立血量 |
| 4+ | 随机循环，数量递增 |

## 素材

游戏支持 AI 生成素材（player.png / enemy.png / bg.png / bullet.png / explosion.png），未提供时自动 fallback 到 Canvas 绘制。
