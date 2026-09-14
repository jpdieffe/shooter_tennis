import { Vector3, Quaternion } from 'three';

// The grip locates the hand, while the target ray points where the player aims.
// Pistols are modeled with their barrel along -Z; props follow the grip itself.
export function heldPose(grip, targetRay, kind) {
  const orientation = kind === 'pistol' && targetRay ? targetRay : grip;
  return {
    p: grip.getWorldPosition(new Vector3()).toArray(),
    q: orientation.getWorldQuaternion(new Quaternion()).toArray()
  };
}
