uniform sampler2D uRefractionMap;
uniform vec3 uCameraPosition;
uniform float uUnderwater;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vRefractionCoord;

#include <fog_pars_fragment>

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
  float viewCosine = clamp(abs(dot(normal, viewDirection)), 0.0, 1.0);
  float edgeBlend = 0.02 + 0.98 * pow(1.0 - viewCosine, 5.0);

  if (uUnderwater > 0.5) {
    float criticalCosine = cos(radians(48.6));
    float totalInternalReflection =
      1.0 - smoothstep(criticalCosine - 0.04, criticalCosine + 0.04, viewCosine);
    edgeBlend = max(edgeBlend, totalInternalReflection);
  }

  vec4 refractionCoord = vRefractionCoord;
  refractionCoord.xy += normal.xz * 0.012 * refractionCoord.w;

  vec3 refractedColor = texture2DProj(uRefractionMap, refractionCoord).rgb;
  vec3 waterTint = vec3(0.02, 0.24, 0.31);
  vec3 surfaceColor = mix(refractedColor, waterTint, edgeBlend);

  gl_FragColor = vec4(surfaceColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
