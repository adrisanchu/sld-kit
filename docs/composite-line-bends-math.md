# How composite line bends follow their endpoints (the math)

This note explains the geometry behind "relative bends" on composite manual
lines: what we store, the formulas that turn that back into pixels, why the
first attempt (a *similarity* transform) made lines rotate, and why the second
attempt (a *translation blend*) behaves the way you expect. It is deliberately
about the math, not the code.

---

## 1. The setup

A manual line connects two **anchor tips** — the two diagrams' connection
points. Call them **A** and **B**. Between them the user drops **free bends**
(the little draggable dots that shape the routing). Take one such bend, **P**.

The two anchors move on their own: dragging a diagram, toggling labels (which
compacts a diagram), or zooming all change where A and B land. When A and B move
to **A′** and **B′**, we want P to move to a sensible **P′** that keeps the line
looking like the one the user drew.

The whole problem is: **choose a rule P′ = f(P, A, B, A′, B′)**. We do it by
storing P *relative to A and B* (never as absolute pixels), then recomputing it
from the current A and B every time the layout runs.

All quantities are 2-D vectors. `·` is the dot product, `|v|` is length,
`|v|² = v·v`.

---

## 2. The chord frame

Both methods build a little coordinate system from the chord **A → B**:

```
d = B − A                      the chord vector (points from A to B)
|d|² = dx² + dy²               its squared length
perp(d) = (−dy, dx)            d rotated 90°, same length as d
```

`d` is the "along the line" direction; `perp(d)` is the "across the line"
direction. Any point P can be written using these two directions plus the
origin A.

We also define the **foot of P on the chord** — how far along A→B the bend sits:

```
t = (P − A) · d / |d|²         a fraction: 0 at A, 1 at B (can be <0 or >1)
base = A + t·d                 the point on the chord directly "under" P
```

Both methods use the **same** `t`. They differ only in how they remember the
*sideways* part, `P − base`.

---

## 3. Method A — the similarity transform (the one that failed)

**Store** P as two dimensionless fractions of the chord:

```
t = (P − A) · d        / |d|²      how far along
n = (P − A) · perp(d)  / |d|²      how far across, as a fraction of chord length
```

**Reconstruct** from the current chord:

```
P′ = A′ + t·d′ + n·perp(d′)        where d′ = B′ − A′
```

This is a **similarity** (rotation + uniform scale + translation). Look at the
sideways term `n·perp(d′)`:

- its **length** is `|n|·|d′|` — so if the chord gets longer, the sideways
  offset grows with it (scaling);
- its **direction** is `perp(d′)` — so if the chord rotates by some angle θ, the
  offset rotates by the *same* θ.

That is exactly the bug. Moving **one** endpoint tilts the chord, and the tilt
drags every bend around with it. The user moves a diagram straight up and the
whole zig-zag swings sideways, because the model glued the bend's offset to the
chord's orientation.

---

## 4. Method B — the translation blend (the one we use)

**Store** the same `t`, but keep the sideways part as a **fixed world vector**
`o = (ox, oy)` — the literal pixel gap between P and its foot on the chord:

```
t = (P − A) · d / |d|²
o = P − base = P − (A + t·d)        a plain (x, y) offset in world pixels
```

**Reconstruct**:

```
P′ = A′ + t·d′ + o                  d′ = B′ − A′,  o is unchanged
```

The only difference from Method A is the last term: `o` instead of
`n·perp(d′)`. Because `o` is a constant world vector, it **never rotates and
never scales**. Only the foot `A′ + t·d′` moves — and that foot is just a blend
of the two endpoints.

### Why this is a pure translation

Substitute `base = A + t·d = (1−t)·A + t·B` and `o = P − base`:

```
P′ = A′ + t·(B′ − A′) + o
   = (1−t)·A′ + t·B′ + o
   = (1−t)·A′ + t·B′ + P − (1−t)·A − t·B
   = P + (1−t)·(A′ − A) + t·(B′ − B)
```

So, writing the endpoint movements as `ΔA = A′ − A` and `ΔB = B′ − B`:

```
P′ = P + (1−t)·ΔA + t·ΔB
```

The bend just **translates** by a weighted average of how far the two endpoints
moved. No rotation term appears anywhere. A bend near A (small `t`) mostly
copies A's motion; a bend near B (large `t`) mostly copies B's; and if both ends
move by the same amount, every bend moves by that same amount and the line
translates rigidly. That is precisely the "it should follow, not spin" behavior.

---

## 5. A worked example with real numbers

Chord and one bend:

```
A = (0, 0)      B = (100, 0)      P = (30, 40)
d = B − A = (100, 0)      |d|² = 100² + 0² = 10000
perp(d) = (−0, 100) = (0, 100)
```

Store P with both methods:

```
along:   t = (P − A)·d / |d|² = (30·100 + 40·0)/10000 = 3000/10000 = 0.3
foot:    base = A + t·d = (0,0) + 0.3·(100,0) = (30, 0)

Method A (similarity):  n = (P − A)·perp(d)/|d|² = (30·0 + 40·100)/10000 = 0.4
Method B (translation): o = P − base = (30,40) − (30,0) = (0, 40)
```

Now **move B straight up** and leave A where it is:

```
A′ = (0, 0)          B′ = (100, 100)          (so ΔA = 0, ΔB = (0, 100))
d′ = B′ − A′ = (100, 100)      |d′|² = 20000
perp(d′) = (−100, 100)
```

**Method A** reconstructs:

```
P′ = A′ + t·d′ + n·perp(d′)
   = (0,0) + 0.3·(100,100) + 0.4·(−100,100)
   = (30, 30) + (−40, 40)
   = (−10, 70)
```

The bend jumped from x = 30 to x = **−10** — it slid *left*, even though nothing
pushed it left. That sideways swing is the rotation artifact.

**Method B** reconstructs:

```
P′ = A′ + t·d′ + o
   = (0,0) + 0.3·(100,100) + (0,40)
   = (30, 30) + (0, 40)
   = (30, 70)
```

Cross-check with the translation formula:

```
P′ = P + (1−t)·ΔA + t·ΔB = (30,40) + 0.7·(0,0) + 0.3·(0,100) = (30, 70)  ✓
```

The bend stayed at x = 30 and rose by 30 — three-tenths of B's 100-pixel rise,
because it sits at `t = 0.3`. Straight up, no swing.

### Same-delta move (both endpoints shift together)

Shift *both* ends by `(20, −10)`:

```
A′ = (20, −10)     B′ = (120, −10)     d′ = (100, 0)  (chord unchanged)

Method B:  P′ = A′ + t·d′ + o = (20,−10) + 0.3·(100,0) + (0,40) = (50, 30)
Check:     P′ = P + (20,−10) = (30,40) + (20,−10) = (50, 30)  ✓
```

The bend moved by exactly `(20, −10)` — the line translated rigidly, keeping its
shape. (Here Method A happens to agree, because the chord didn't rotate or
scale. The two methods only diverge when an endpoint move *changes the chord's
angle or length*, as in the first example.)

---

## 6. Why "translation" is the right choice here

These are schematic tie-lines between substations. When you nudge a diagram, you
expect the connector to **come along**, keeping its bends and its overall shape —
not to pivot around the far diagram. The translation blend gives each bend a
share of the endpoints' motion based on where it sits along the line, which is
the intuitive "rubber band with fixed kinks" feel. The similarity transform,
by contrast, treats the connector as a rigid shape pinned to a rotating,
stretching chord, so it wheels around whenever one end moves more than the other.

The only thing the translation blend gives up is that a bend's sideways offset no
longer scales when the two diagrams move far apart — the perpendicular bulge
stays a fixed number of pixels. For orthogonal-ish routing that is exactly what
you want; the along-chord `t` still lets the bends spread out to span a widening
gap.

---

## 7. Edge cases

- **Coincident endpoints** (`A = B`, so `|d|² ≈ 0`): there is no chord and no
  meaningful `t`. We refuse to build the frame and fall back to storing the bend
  as an absolute point.
- **Fewer than two anchors on the line**: a relative bend needs both A and B to
  exist. A line that isn't anchored to two diagrams keeps absolute bends — it
  isn't spanning anything, so there is nothing for it to follow.
- **More than two anchors**: we use the line's first and last resolvable anchor
  tips as A and B; the bends in between ride that single chord.
