# Mixamo source animations

Downloaded for MAAi v02 as FBX Binary, Without Skin, 30 fps, with no keyframe reduction.

The filenames use the animation clip names expected by the game. Source animation titles and any deviations are documented after the batch is complete.

| Game clip | Mixamo source |
|---|---|
| `idle_guard` | Boxing — Boxing Idle |
| `jab` | Lead Jab — Short Head Jab |
| `cross` | Cross Punch — A Cross Punch |
| `hook_lead` | Hook Punch — A Hook Punch |
| `uppercut_rear` | uppercutBoxing (user-selected replacement) |
| `kick_low` | Mma Kick — Mma Low Kick |
| `takedown` | Double Leg Takedown - Attacker — to ground and pound |
| `hit_head` | Head Hit — medium hit from a left punch |
| `ko` | Knocked Out — falling to back |

Notes:

- Mixamo did not expose an In Place option for these selected downloads. Locomotion/root displacement must be removed during Blender import/cleanup where required.
- Files are animation-only (`Without Skin`) and are intended to be retargeted to the common character rig before GLB export.
- The previous uppercut is retained as `uppercut_rear_previous.fbx` for comparison.
