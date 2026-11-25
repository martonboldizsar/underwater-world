uniform float uTime;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vRefractionCoord;

uniform mat4 uRefractionMatrix;

#include <fog_pars_vertex>

void main() {
  vec3 p = position;
  float phase1 = p.x * 0.7 + uTime * 1.2;
  float phase2 = p.z * 0.9 + uTime * 0.8;
  float phase3 = p.x * 0.2 + p.z * 0.4 - uTime * 0.6;
  p.y += sin(phase1) * 0.12;
  p.y += sin(phase2) * 0.08;
  p.y += sin(phase3) * 0.15;

  float slopeX = cos(phase1) * 0.084 + cos(phase3) * 0.03;
  float slopeZ = cos(phase2) * 0.072 + cos(phase3) * 0.06;
  vec3 localNormal = normalize(vec3(-slopeX, 1.0, -slopeZ));

  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
  vRefractionCoord = uRefractionMatrix * worldPosition;
  vec4 mvPosition = viewMatrix * worldPosition;
  #include <fog_vertex>
  gl_Position = projectionMatrix * mvPosition;
}
