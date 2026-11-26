// Preview-side bindings for the pixel functions read from the installed game.
export const passes = {
  "fractured": "Fractured",
  "synthesised": "Synthesized",
  "memory": "ZanaPetalsItemEffect",
  "replica": "Prototype",
  "foulborn": "BreachMutated",
  "scourged": "Hellscaped",
  "foreseeing": "HinekorasLockIdle",
  "vestigial": "VestigialItemEffect",
  "foil": "Holo",
  "supporter-foil": "SupporterHolo",
  "celestial-foil": "SupporterHoloTwo",
  "viscera-back": "Viscera",
  "viscera-surface": "Desaturate",
  "rim-front": "CrusaderGlow",
  "trarthan": "AzmeriWoodsDustEffect"
};
export const conquerors = ["Basilisk", "Crusader", "Eyrie", "Conqueror"];
export const bindings = `
#define TEXTURE2D_DECL(name) Texture2D<float4> name
#define SAMPLE_TEX2D(image, sampler_name, uv) image.Sample(sampler_name, uv)
#define SAMPLE_TEX2DLOD(image, sampler_name, uv) image.SampleLevel(sampler_name, (uv).xy, (uv).w)
#define SamplerLinearClampOffsetNoBias SamplerLinearClamp
#define SamplerLinearWrapOffsetNoBias SamplerLinearWrap
#define PIXEL_RETURN_SEMANTIC SV_Target0
static const float sdr_scale = 1.0f;
static const float2 hex_ratio = float2(1.0, sqrt(3.0));
cbuffer Preview { float time; float seed; float2 spriteUV; float4 item_size; float4 hellscape_params; int rim; };
static const float4 effect_params = float4(1, 0, 0, 0);
Texture2D<float4> tex, muddle_tex, turbulence_tex, fractal_tex, hellscape_noise_tex;
Texture2D<float4> petal_map1, petal_map2, petal_map3, petal_map4, petal_map5, petal_map6;
Texture2D<float4> influence_layer_0_tex, influence_layer_1_tex, influence_noise_tex, mask_tex;
Texture2D<float4> mask_layer_0_tex, mask_layer_1_tex;
SamplerState SamplerLinearWrap, SamplerLinearClamp;
struct VS_OUTPUT { float2 texture_uv; float4 sat_scale_localuv; float4 colour; };
`;
