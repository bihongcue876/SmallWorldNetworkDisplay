/**
 * 「结论」页正文。
 * 分三类内容，措辞必须区分清楚：
 *   文献结论 —— 别人证明的定理，本页只引用；
 *   本项目实测 —— 本仓库脚本跑出来的数，注明来源；
 *   边界 —— 不宣称证明最优性。
 */
export const THEORY_HTML = `
<div class="theory-grid">

  <section class="card">
    <h3>一、模型</h3>
    <table class="kv">
      <tr><th>节点</th><td>n×n 环面网格，共 n² 个；上下、左右相接</td></tr>
      <tr><th>距离</th><td>曼哈顿距离 d(u,v)=|Δx|+|Δy|，Δ 取 min(Δ, n−Δ)</td></tr>
      <tr><th>本地边</th><td>每个节点连 4 个邻居，无向，可反复使用</td></tr>
      <tr><th>长程边</th><td>每个节点 1 条有向边，指向 v 的概率 ∝ d(u,v)<sup>−q</sup></td></tr>
      <tr><th>信息</th><td>只看邻居坐标与目标坐标；不搜索、不记忆、不知全局</td></tr>
    </table>
    <p class="small">本页的 α 与课程里的 q 是同一个量。Kleinberg 原文记作 r，维数记作 d。</p>
  </section>

  <section class="card">
    <h3>二、路由方案</h3>
    <ol class="steps">
      <li>当前节点 u 列出可去的位置：4 个本地邻居 + 1 条长程边指向的节点。</li>
      <li>在其中选曼哈顿距离 d(·, t) 最小的那个；严格更近才走。</li>
      <li>到达 t 即停。走不动即为失败——本模型中不会发生。</li>
    </ol>
    <p class="small">
      这就是 Kleinberg 证明上界时用的贪心规则。它不需要知道上一步从哪来，
      也不需要知道网络里还有哪些长程边。
    </p>
  </section>

  <section class="card wide">
    <h3>三、文献结论（引用，非本项目证明）</h3>
    <div class="thm">
      <span class="tag">Kleinberg 2000, STOC, Theorem 3(b)</span>
      <p>q &gt; 2 时，任意分散算法的期望步数至少为 α<sub>q</sub>·n<sup>(q−2)/(q−1)</sup>。</p>
    </div>
    <div class="thm">
      <span class="tag">Kleinberg 2000, STOC, Theorem 3(a)</span>
      <p>0 ≤ q &lt; 2 时，任意分散算法的期望步数至少为 α<sub>q</sub>·n<sup>(2−q)/3</sup>。</p>
    </div>
    <div class="thm">
      <span class="tag">Kleinberg 2000, STOC, Theorem 2</span>
      <p>q = 2 时存在分散算法，期望步数不超过 α<sub>2</sub>·(log n)²。</p>
    </div>
    <div class="thm">
      <span class="tag">推论</span>
      <p>q = 2 是唯一使期望步数落在 log n 的多项式量级的指数；其余取值都要付 n 的幂次代价。</p>
    </div>
    <p class="small">
      常数 α<sub>q</sub> 只依赖维数与 q，不依赖 n。三条合起来是一个尖锐的临界现象，
      不是「q=2 比较好」这种程度上的差别。
    </p>
  </section>

  <section class="card wide">
    <h3>四、临界点从哪来</h3>
    <p>一步之内落入以 t 为心、半径 d/2 的曼哈顿球内的概率是</p>
    <div class="formula">P(d) = Σ<sub>d(v,t) &lt; d/2</sub> d(u,v)<sup>−q</sup> / Z(q)</div>
    <p>
      球内点数约 d²/2，各点到 u 的距离都约等于 d，所以分子约 d<sup>2−q</sup>；
      分母 Z(q) 是全部长程边的归一化常数，q=2 时约 ln n，q&lt;2 时约 n<sup>2−q</sup>/(2−q)，q&gt;2 时趋于常数。
    </p>
    <table class="kv">
      <tr><th>q = 2</th><td>P(d) ≈ 1/ln n，与 d 无关 → 每个尺度都花 ln n 步，尺度数约 log₂n，总计 (log n)²</td></tr>
      <tr><th>q &lt; 2</th><td>P(d) ∝ d<sup>2−q</sup>，越近越难命中，收尾阶段拖成多项式</td></tr>
      <tr><th>q &gt; 2</th><td>P(d) 随 d 衰减，远处没有可用跳板，开局就靠本地边爬</td></tr>
    </table>
    <p class="small">
      要害是「与 d 无关」：只有 q=2 让每个距离尺度上的命中率相同，
      贪心才能稳定地每阶段把距离减半。其余指数总有一个尺度缺跳板。
    </p>
  </section>

  <section class="card">
    <h3>五、本项目实测到的性质</h3>
    <p class="small">数据见 results/，图见 figures/figure-mechanism.png、figure-qstar.png。</p>
    <p><b>性质 1　成功率恒为 1。</b>可证：d&gt;0 时沿较近的那条轴走一格必使距离减 1，
      故四邻中至少有一个严格更近，贪心不会卡死。n=64…1024、q=1…3 实测全部 100%。</p>
    <p><b>性质 2　q=2 时 P(d) 对 d 平坦。</b>n=1024，取 d 从 11 到约 360 这一段（跨 32 倍），
      各 q 的命中率变化幅度：</p>
    <table class="kv mini">
      <tr><th>q</th><td>P(d) 范围</td><td class="num">变化倍数</td></tr>
      <tr><th>1</th><td>0.0014 – 0.0610</td><td class="num">43×</td></tr>
      <tr><th>1.5</th><td>0.0087 – 0.0473</td><td class="num">5.4×</td></tr>
      <tr><th>2</th><td>0.0175 – 0.0202</td><td class="num">1.2×</td></tr>
      <tr><th>2.5</th><td>0.0029 – 0.0179</td><td class="num">6.1×</td></tr>
      <tr><th>3</th><td>0.00027 – 0.0097</td><td class="num">36×</td></tr>
    </table>
    <p class="small">q=2 那一行的理论值是 0.0207–0.0218，与实测同量级。其余四行变化 5–43 倍，
      而且方向相反：q&lt;2 时近处几乎命中不了，q&gt;2 时远处几乎命中不了。</p>
    <p><b>性质 3　每阶段步数 ∝ 1/P(d) ∝ ln n。</b>n 从 64 增到 1024，
      P·ln n 始终落在 0.11–0.19，理论 0.14–0.16，没有随 n 单调漂移的迹象。</p>
    <p><b>性质 4　总步数可预测。</b>用相对收缩模型（每步距离的期望缩减）推算总步数，
      q=2 时误差 1%–7%，其余 q 在 ±22% 内，偏差随 q 单调并在 q=2 附近穿过 1。</p>
  </section>

  <section class="card">
    <h3>六、有限尺寸偏差</h3>
    <p>实测最优指数 q* 随 n 右移，但没到 2：</p>
    <table class="kv">
      <tr><th>n=32</th><td>q* = 1.00</td></tr>
      <tr><th>n=128</th><td>q* = 1.50</td></tr>
      <tr><th>n=512</th><td>q* = 1.75</td></tr>
      <tr><th>n=1024</th><td>q* = 1.75</td></tr>
    </table>
    <p>四条原因：尺度数只有 log₂n；小 n 时本地边的相对贡献更大；环面最大距离截断在 n/2；
      小 n 的菱形各向异性更强。</p>
    <p class="small">
      Clauset &amp; Moore 2003 在格子上测得最优指数低于理论值 d，且按 1/(log n)² 的速度
      缓慢逼近（一维情形：低于 1，向 1 收敛），并明言有限尺寸效应很严重。本页数据方向一致。
    </p>
  </section>

  <section class="card wide boundary">
    <h3>七、边界</h3>
    <p>
      本页验证的是引理的前提——P(d) 在 q=2 时确实与 d 无关——以及有限尺寸偏差的量级。
      最优性本身由上面三条定理给出，本项目没有、也不打算重新证明它。
    </p>
    <p>
      n &gt; 1024 的结果属于外推。环面与曼哈顿距离是对真实社交空间的高度简化，
      本页结论不直接外推到真实网络。
    </p>
  </section>

</div>
`;
