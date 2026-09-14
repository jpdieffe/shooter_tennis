import { Vector3, Quaternion } from 'three';

// Keep the tracked head under the same rig as the controllers. The renderer’s
// internal XR ArrayCamera is parentless; its world getters lose the rig offset.
export function updateTrackedHead(head, frame, referenceSpace) {
  if (!frame || !referenceSpace) return false;
  const viewer = frame.getViewerPose(referenceSpace);
  if (!viewer) return false;
  head.position.copy(viewer.transform.position);
  head.quaternion.copy(viewer.transform.orientation);
  head.updateWorldMatrix(true, false);
  return true;
}

export function calibrateRig(rig, head, { anchor = null, eyeHeight = null } = {}) {
  const current = head.getWorldPosition(new Vector3());
  if (anchor) { rig.position.x += anchor[0] - current.x; rig.position.z += anchor[2] - current.z; }
  rig.position.y = eyeHeight === null ? 0 : rig.position.y + eyeHeight - current.y;
  rig.updateMatrixWorld(true);
}

// The grip locates the hand, while the target ray points where the player aims.
// Pistols are modeled with their barrel along -Z; props follow the grip itself.
export function heldPose(grip, targetRay, kind) {
  const orientation = kind === 'pistol' && targetRay ? targetRay : grip;
  return {
    p: grip.getWorldPosition(new Vector3()).toArray(),
    q: orientation.getWorldQuaternion(new Quaternion()).toArray()
  };
}
