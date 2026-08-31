# MAAi model handoff — REN KAGURA v01

## Primary asset

- File: `ren_kagura_v01.glb`
- glTF: 2.0 binary GLB
- Coordinate system: Y-up, +Z front
- Bind pose: T-pose
- Height: exactly 1.83 m
- Origin: midpoint between feet at floor height (`minY = 0` in glTF coordinates)
- Triangles: 29,956
- File size: about 1.22 MB
- Images/textures: 0 (cel materials only)
- Animation clips: 0
- Validator: 0 errors, 0 warnings

## Runtime contract

The skeleton is Mixamo-compatible. The complete list is in
`ren_kagura_bones.json`. Required driving nodes are:

```text
mixamorig:Hips
mixamorig:Spine
mixamorig:Spine1
mixamorig:Spine2
mixamorig:Neck
mixamorig:Head
mixamorig:LeftShoulder
mixamorig:LeftArm
mixamorig:LeftForeArm
mixamorig:LeftHand
mixamorig:RightShoulder
mixamorig:RightArm
mixamorig:RightForeArm
mixamorig:RightHand
mixamorig:LeftUpLeg
mixamorig:LeftLeg
mixamorig:LeftFoot
mixamorig:LeftToeBase
mixamorig:RightUpLeg
mixamorig:RightLeg
mixamorig:RightFoot
mixamorig:RightToeBase
```

The gloves are independent skinned meshes:

```text
MAAi_Glove_L -> 100% mixamorig:LeftHand
MAAi_Glove_R -> 100% mixamorig:RightHand
```

They follow hand rotation while remaining independently addressable by mesh
name. The visual glove geometry is provisional and can be replaced without
changing the skeleton contract.

## Morph targets

The body mesh is `MAAi_Ren_Body`. Its exact morph order is:

```text
0 blink
1 mouthOpen
2 pain
```

Prefer looking up indices through `morphTargetDictionary`, rather than relying
on this numeric order.

```js
const body = gltf.scene.getObjectByName('MAAi_Ren_Body');
body.morphTargetInfluences[body.morphTargetDictionary.blink] = blinkAmount;
body.morphTargetInfluences[body.morphTargetDictionary.mouthOpen] = breathAmount;
body.morphTargetInfluences[body.morphTargetDictionary.pain] = damageAmount;
```

## Three.js loading check

```js
loader.load('./ren_kagura_v01.glb', (gltf) => {
  const fighter = gltf.scene;
  const hips = fighter.getObjectByName('mixamorig:Hips');
  const leftHand = fighter.getObjectByName('mixamorig:LeftHand');
  const rightHand = fighter.getObjectByName('mixamorig:RightHand');

  if (!hips || !leftHand || !rightHand) {
    throw new Error('MAAi fighter skeleton contract mismatch');
  }

  scene.add(fighter);
});
```

## Known production note

The Blender exporter normalizes the small number of vertices carrying more
than four joint influences to their strongest four weights. This is the normal
WebGL skinning limit. Shoulder, elbow and knee extreme-angle visual checks
should still be completed in the game's twelve target situations.

## Files

- `ren_kagura_v01.glb` — runtime asset
- `ren_kagura_bones.json` — complete bone-name list
- `ren_kagura_morphs.json` — morph contract
- `gltf-validator-report.json` — Khronos validator result
- `ren_kagura_game_source.blend` — editable source

