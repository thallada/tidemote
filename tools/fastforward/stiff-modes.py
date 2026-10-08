# Linear stability of coarse-step motion schemes, mode by mode (docs/fast-forward.md, item 3): a lattice mode of
# eigenvalue lam in [0, 2D] (D a cell's own stiffness), 4 ticks a step, against 4 explicit 1/60 s ticks.
# python3 tools/fastforward/stiff-modes.py
# Mode-by-mode analysis on a lattice: cell own stiffness D, mode eigenvalue lam in [0, 2D], neighbours'
# mean velocity vNear = (1 - lam/D) v (chain). Reference: 4 explicit 1/60 s ticks, force recomputed.
import numpy as np
h = 1/60; n = 4; dt = n*h
def run(step, lam, D, gam):
    cols = [step(1.0, 0.0, lam, D, gam), step(0.0, 1.0, lam, D, gam)]
    return np.array([[cols[0][0], cols[1][0]], [cols[0][1], cols[1][1]]])
def ref(x, v, lam, D, gam):
    fr = np.exp(-gam*h)
    for _ in range(n):
        v = v*fr - lam*x*h; x = x + v*h
    return x, v
def A(theta):
    def f(x, v, lam, D, gam):
        fr = np.exp(-gam*h); frT = fr**n; P = (1-frT)/gam; Q = (dt-P)/gam
        a0 = -lam*x; vrel = v - (1-lam/D)*v
        dx = (P*vrel + Q*a0)/(1 + theta*Q*D); acc = a0 - theta*D*dx
        for _ in range(n):
            v = v*fr + acc*h; x = x + v*h
        return x, v
    return f
def B(c, micro=20):
    def f(x, v, lam, D, gam):
        S = c*D; x0 = x; vN = (1-lam/D)*v; a0 = -lam*x
        hh = h/micro; fr = np.exp(-gam*hh); t = 0.0
        for _ in range(n*micro):   # own linear motion against neighbours drifting at vN, fine integration
            acc = a0 - S*(x - x0 - vN*t)
            v = v*fr + acc*hh; x = x + v*hh; t += hh
        return x, v
    return f
def rho(M): return max(abs(np.linalg.eigvals(M)))
gam = np.log(2)/0.12
for D in [50, 200, 800, 2000]:
    print(f'\nD={D}  omega_max*dt={np.sqrt(2*D)*dt:.2f}')
    print('lam/D   ref    A1     A0.5   B1     B1.5   B2')
    for r in [0.05, 0.2, 0.5, 1.0, 1.5, 2.0]:
        lam = r*D
        vals = [rho(run(ref, lam, D, gam)), rho(run(A(1), lam, D, gam)), rho(run(A(0.5), lam, D, gam)), rho(run(B(1), lam, D, gam)), rho(run(B(1.5), lam, D, gam)), rho(run(B(2), lam, D, gam))]
        print(f'{r:5.2f} ' + ' '.join(f'{x:6.3f}' for x in vals))

def C(c, held):
    def f(x, v, lam, D, gam):
        frT = np.exp(-gam*dt); G = (1-frT)/gam; vN = (1-lam/D)*v; a0 = -lam*x
        vnew = (frT*v + G*(a0 + c*D*dt*vN))/(1 + c*D*dt*G)
        if not held:
            return x + dt*vnew, vnew
        aeff = (vnew - frT*v)/G   # held acceleration giving the same end velocity
        fr = np.exp(-gam*h)
        for _ in range(n):
            v = v*fr + aeff*h; x = x + v*h
        return x, v
    return f
print('\n\nbackward Euler in relative velocity')
for D in [50, 200, 800, 2000, 8000]:
    print(f'\nD={D}  omega_max*dt={np.sqrt(2*D)*dt:.2f}')
    print('lam/D   ref    C1p    C2p    C1h    C2h')
    for r in [0.05, 0.2, 0.5, 1.0, 1.5, 2.0]:
        lam = r*D
        vals = [rho(run(ref, lam, D, gam)), rho(run(C(1,False), lam, D, gam)), rho(run(C(2,False), lam, D, gam)), rho(run(C(1,True), lam, D, gam)), rho(run(C(2,True), lam, D, gam))]
        print(f'{r:5.2f} ' + ' '.join(f'{x:6.3f}' for x in vals))

def Ac(theta, c):
    def f(x, v, lam, D, gam):
        return A(theta)(x, v, lam, c*D, gam) if False else _Ac(x, v, lam, D, gam, theta, c)
    return f
def _Ac(x, v, lam, D, gam, theta, c):
    fr = np.exp(-gam*h); frT = fr**n; P = (1-frT)/gam; Q = (dt-P)/gam
    a0 = -lam*x; vrel = v - (1-lam/D)*v
    dx = (P*vrel + Q*a0)/(1 + theta*Q*c*D); acc = a0 - theta*c*D*dx
    for _ in range(n):
        v = v*fr + acc*h; x = x + v*h
    return x, v
print('\n\nA with stiffness scaled by c (theta 1): max rho over lam in [0,2D], and rho at lam=0.05D, 0.2D')
lams = np.linspace(0.01, 2.0, 60)
print('D      ' + '  '.join(f'c={c:<14}' for c in [1, 1.5, 2, 3, 4]))
for D in [50, 200, 400, 800, 1500, 3000, 6000]:
    row = []
    for c in [1, 1.5, 2, 3, 4]:
        rs = [rho(run(Ac(1, c), r*D, D, gam)) for r in lams]
        row.append(f'{max(rs):5.2f} {rho(run(Ac(1,c),0.05*D,D,gam)):5.2f} {rho(run(Ac(1,c),0.2*D,D,gam)):5.2f}')
    print(f'{D:5d}  ' + '  '.join(row))

def Av(theta, c, alpha, Dlam=None):
    def f(x, v, lam, D, gam):
        fr = np.exp(-gam*h); frT = fr**n; P = (1-frT)/gam; Q = (dt-P)/gam
        a0 = -lam*x; vrel = v - alpha*(1-lam/D)*v
        dx = (P*vrel + Q*a0)/(1 + theta*Q*c*D); acc = a0 - theta*c*D*dx
        for _ in range(n):
            v = v*fr + acc*h; x = x + v*h
        return x, v
    return f
print('\n\nA, neighbour drift scaled by alpha: max rho over lam in [0,2D] / rho at 0.05D / 0.2D / 1.0D')
for alpha in [1.0, 0.5, 0.0]:
  for c in [1, 2]:
    print(f'alpha={alpha} c={c}')
    for D in [50, 200, 400, 800, 1500, 3000, 6000]:
        rs = [rho(run(Av(1, c, alpha), r*D, D, gam)) for r in lams]
        print(f'  D={D:5d}  max {max(rs):5.2f}  0.05D {rho(run(Av(1,c,alpha),0.05*D,D,gam)):5.2f}  0.2D {rho(run(Av(1,c,alpha),0.2*D,D,gam)):5.2f}  1.0D {rho(run(Av(1,c,alpha),1.0*D,D,gam)):5.2f}')

print('\n\nalpha=0: max rho over lam in [0,2D] for theta, c  (ref unstable past D~7200)')
for th, c in [(1,1),(1,2),(2,1),(2,2),(4,1),(4,2)]:
    row = []
    for D in [800, 1500, 3000, 5000, 7000]:
        rs = [rho(run(Av(th, c, 0.0), r*D, D, gam)) for r in lams]
        row.append(f'{max(rs):5.2f}')
    print(f'th={th} c={c}: ' + ' '.join(row) + f'   soft 0.2D@800 {rho(run(Av(th,c,0.0),0.2*800,800,gam)):5.2f}')

def Ca(c, alpha, held):
    def f(x, v, lam, D, gam):
        frT = np.exp(-gam*dt); G = (1-frT)/gam; vN = alpha*(1-lam/D)*v; a0 = -lam*x
        vnew = (frT*v + G*(a0 + c*D*dt*vN))/(1 + c*D*dt*G)
        if not held:
            return x + dt*vnew, vnew
        aeff = (vnew - frT*v)/G
        fr = np.exp(-gam*h)
        for _ in range(n):
            v = v*fr + aeff*h; x = x + v*h
        return x, v
    return f
print('\n\nC (BE in relative velocity), alpha: max rho over [0,2D] at D = 200 800 1500 3000 5000 7000; soft 0.2D@200, 0.2D@800')
for alpha in [0.0, 0.5, 1.0]:
  for c in [1, 2]:
    for held in [False, True]:
        row = [f'{max(rho(run(Ca(c,alpha,held), r*D, D, gam)) for r in lams):5.2f}' for D in [200, 800, 1500, 3000, 5000, 7000]]
        print(f'a={alpha} c={c} {"held" if held else "pure"}: ' + ' '.join(row) + f'   {rho(run(Ca(c,alpha,held),40,200,gam)):5.2f} {rho(run(Ca(c,alpha,held),160,800,gam)):5.2f}')

def Cb(c, beta, held=True):
    def f(x, v, lam, D, gam):
        frT = np.exp(-gam*dt); G = (1-frT)/gam; vN = (1-lam/D)*v; a0 = -lam*x
        vrel = beta*(v - vN)      # velocity against the local mean (self weighted with the neighbours)
        # BE in the relative velocity: the pair force at the end, a0 - c D dt vrel_new, vrel_new = beta (vnew - vN)
        vnew = (frT*v + G*(a0 + c*D*dt*beta*vN))/(1 + c*D*dt*G*beta)
        if not held:
            return x + dt*vnew, vnew
        aeff = (vnew - frT*v)/G
        fr = np.exp(-gam*h)
        for _ in range(n):
            v = v*fr + aeff*h; x = x + v*h
        return x, v
    return f
def drift(step, D):  # lam = 0: a crowd moving together keeps its velocity under drag alone
    x, v = step(0.0, 1.0, 0.0, D, gam)
    return v
print('\n\nC, v_rel = beta (v - vNear): max rho at D = 200 800 1500 3000 5000 7000 | soft 0.2D@200 0.2D@800 | drift v ratio at D=800 (ref', round(float(np.exp(-gam*dt)),3), ')')
for c in [1, 2]:
  for beta in [0.5, 0.75, 1.0]:
    row = [f'{max(rho(run(Cb(c,beta), r*D, D, gam)) for r in lams):5.2f}' for D in [200, 800, 1500, 3000, 5000, 7000]]
    print(f'c={c} beta={beta}: ' + ' '.join(row) + f' | {rho(run(Cb(c,beta),40,200,gam)):5.2f} {rho(run(Cb(c,beta),160,800,gam)):5.2f} | {drift(Cb(c,beta),800):5.3f}')
print('per-mode rho for c=1 beta=0.5 at D=3000:', ' '.join(f'{rho(run(Cb(1,0.5), r*3000, 3000, gam)):4.2f}' for r in [0.05,0.2,0.5,1,1.5,2]))
print('per-mode rho for c=1 beta=0.5 at D=200: ', ' '.join(f'{rho(run(Cb(1,0.5), r*200, 200, gam)):4.2f}' for r in [0.05,0.2,0.5,1,1.5,2]))
print('ref                                      ', ' '.join(f'{rho(run(ref, r*200, 200, gam)):4.2f}' for r in [0.05,0.2,0.5,1,1.5,2]))

def Cr(c, held=True, rmin=-1.0):
    def f(x, v, lam, D, gam):
        frT = np.exp(-gam*dt); G = (1-frT)/gam; vN = (1-lam/D)*v; a0 = -lam*x
        r = np.clip(vN*v/(v*v + 1e-12), rmin, 1.0) if abs(v) > 1e-9 else 0.0
        vnew = (frT*v + G*a0)/(1 + c*D*dt*G*(1 - r))
        if not held:
            return x + dt*vnew, vnew
        aeff = (vnew - frT*v)/G
        fr = np.exp(-gam*h)
        for _ in range(n):
            v = v*fr + aeff*h; x = x + v*h
        return x, v
    return f
print('\n\nCr (neighbours keep the mode shape): max rho at D = 200 800 1500 3000 5000 7000 | per-mode at D=800 for lam/D .05 .2 .5 1 1.5 2 | drift')
for c in [1.0, 0.5]:
  for held in [True, False]:
    st = Cr(c, held)
    row = [f'{max(rho(run(st, r*D, D, gam)) for r in lams):5.2f}' for D in [200, 800, 1500, 3000, 5000, 7000]]
    pm = ' '.join(f'{rho(run(st, r*800, 800, gam)):4.2f}' for r in [0.05,0.2,0.5,1,1.5,2])
    print(f'c={c} {"held" if held else "pure"}: ' + ' '.join(row) + f' | {pm} | {drift(st,800):5.3f}')
print('ref per-mode @800:', ' '.join(f'{rho(run(ref, r*800, 800, gam)):4.2f}' for r in [0.05,0.2,0.5,1,1.5,2]))

def M2(Mn, c=1.0, held=True):
    def f(x, v, lam, D, gam):
        frT = np.exp(-gam*dt); G = (1-frT)/gam; vN = (1-lam/D)*v; a0 = -lam*x
        vc = (v + Mn*vN)/(1 + Mn); vr = v - vN
        k = c*D*(1 + 1/Mn)
        vr_new = (frT*vr + G*a0*(1 + 1/Mn))/(1 + G*dt*k)
        vnew = frT*vc + vr_new*Mn/(1 + Mn)
        if not held:
            return x + dt*vnew, vnew
        aeff = (vnew - frT*v)/G
        fr = np.exp(-gam*h)
        for _ in range(n):
            v = v*fr + aeff*h; x = x + v*h
        return x, v
    return f
print('\n\ntwo-body momentum-conserving BE, chain modes: max rho at D = 200 800 1500 3000 7000 | per-mode @800 .05 .2 .5 1 1.5 2 | drift')
for Mn in [1, 2, 6, 20]:
    st = M2(Mn)
    row = [f'{max(rho(run(st, r*D, D, gam)) for r in lams):5.2f}' for D in [200, 800, 1500, 3000, 7000]]
    pm = ' '.join(f'{rho(run(st, r*800, 800, gam)):4.2f}' for r in [0.05,0.2,0.5,1,1.5,2])
    print(f'Mn={Mn:3d}: ' + ' '.join(row) + f' | {pm} | {drift(st,800):5.3f}')
# a pair (swimmer hits resting neighbour): two cells, stiffness k between, exact 1/60 reference vs scheme with Mn = 1
def pair_ref(k, steps=8):
    gamm = gam; fr = np.exp(-gamm*h); x1, x2, v1, v2 = 0.0, 0.0, 1.0, 0.0
    out = []
    for s in range(steps):
        for _ in range(n):
            f = -k*(x1 - x2); v1 = v1*fr + f*h; v2 = v2*fr - f*h; x1 += v1*h; x2 += v2*h
        out.append((v1, v2))
    return out
def pair_scheme(k, Mn, steps=8, mode='two'):
    frT = np.exp(-gam*dt); G = (1-frT)/gam; fr = np.exp(-gam*h)
    x1, x2, v1, v2 = 0.0, 0.0, 1.0, 0.0
    out = []
    for s in range(steps):
        new = []
        for (x, v, xo, vo) in [(x1, v1, x2, v2), (x2, v2, x1, v1)]:
            a0 = -k*(x - xo); D = k
            if mode == 'two':
                vc = (v + Mn*vo)/(1 + Mn); vr = v - vo
                vr_new = (frT*vr + G*a0*(1 + 1/Mn))/(1 + G*dt*D*(1 + 1/Mn))
                vn = frT*vc + vr_new*Mn/(1 + Mn)
            else:  # mode-shape r
                r = np.clip(vo*v/(v*v), -1, 1) if abs(v) > 1e-9 else 0.0
                vn = (frT*v + G*a0)/(1 + G*dt*D*(1 - r))
            aeff = (vn - frT*v)/G
            xx, vv = x, v
            for _ in range(n):
                vv = vv*fr + aeff*h; xx += vv*h
            new.append((xx, vv))
        (x1, v1), (x2, v2) = new
        out.append((v1, v2))
    return out
for k in [50, 400, 2000]:
    print(f'\npair k={k}: step: ref (v1,v2) | two-body Mn=1 | mode-shape r')
    R = pair_ref(k); T = pair_scheme(k, 1); Mr = pair_scheme(k, 1, mode='r')
    for s in range(5):
        print(f'  {s}: ({R[s][0]:+.3f},{R[s][1]:+.3f}) | ({T[s][0]:+.3f},{T[s][1]:+.3f}) | ({Mr[s][0]:+.3f},{Mr[s][1]:+.3f})')
