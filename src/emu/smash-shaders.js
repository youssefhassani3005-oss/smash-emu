// Shaders « Smash » pour toutes les consoles (format GLSL RetroArch, chargés par EmulatorJS via EJS_shaders).
// Chaque effet est une fonction effect(uv) ; les préréglages en plusieurs passes enchaînent ces effets.
(function () {
	const HEADER = `
#if defined(VERTEX)
#if __VERSION__ >= 130
#define COMPAT_VARYING out
#define COMPAT_ATTRIBUTE in
#else
#define COMPAT_VARYING varying
#define COMPAT_ATTRIBUTE attribute
#endif
#ifdef GL_ES
#define COMPAT_PRECISION mediump
#else
#define COMPAT_PRECISION
#endif
COMPAT_ATTRIBUTE vec4 VertexCoord;
COMPAT_ATTRIBUTE vec4 TexCoord;
COMPAT_VARYING vec4 TEX0;
uniform mat4 MVPMatrix;
void main() { gl_Position = MVPMatrix * VertexCoord; TEX0.xy = TexCoord.xy; }
#elif defined(FRAGMENT)
#ifdef GL_ES
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define COMPAT_PRECISION mediump
#else
#define COMPAT_PRECISION
#endif
#if __VERSION__ >= 130
#define COMPAT_VARYING in
#define COMPAT_TEXTURE texture
out COMPAT_PRECISION vec4 FragColor;
#else
#define COMPAT_VARYING varying
#define FragColor gl_FragColor
#define COMPAT_TEXTURE texture2D
#endif
uniform COMPAT_PRECISION int FrameCount;
uniform COMPAT_PRECISION vec2 OutputSize;
uniform COMPAT_PRECISION vec2 TextureSize;
uniform COMPAT_PRECISION vec2 InputSize;
uniform sampler2D Texture;
COMPAT_VARYING vec4 TEX0;
#define vTexCoord TEX0.xy
#define PX (1.0 / TextureSize)
vec3 T(vec2 uv) { return COMPAT_TEXTURE(Texture, uv).rgb; }
float L(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;
	const FOOTER = `
void main() { FragColor = vec4(clamp(effect(vTexCoord), 0.0, 1.0), 1.0); }
#endif
`;

	const EFFECTS = {
		// Netteté adaptative au contraste (inspirée d'AMD FidelityFX CAS).
		cas: `
vec3 effect(vec2 uv) {
	vec3 a = T(uv + vec2(0.0, -PX.y)), b = T(uv + vec2(-PX.x, 0.0)), c = T(uv), d = T(uv + vec2(PX.x, 0.0)), e = T(uv + vec2(0.0, PX.y));
	vec3 mn = min(min(min(a, b), min(d, e)), c);
	vec3 mx = max(max(max(a, b), max(d, e)), c);
	vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(0.0001)), 0.0, 1.0));
	vec3 w = amp * (-1.0 / 5.5);
	return (c + (a + b + d + e) * w) / (1.0 + 4.0 * w);
}`,
		// Anticrénelage rapide (FXAA simplifié).
		fxaa: `
vec3 effect(vec2 uv) {
	vec3 nw = T(uv + vec2(-1.0, -1.0) * PX), ne = T(uv + vec2(1.0, -1.0) * PX), sw = T(uv + vec2(-1.0, 1.0) * PX), se = T(uv + vec2(1.0, 1.0) * PX), m = T(uv);
	float lnw = L(nw), lne = L(ne), lsw = L(sw), lse = L(se), lm = L(m);
	float lmin = min(lm, min(min(lnw, lne), min(lsw, lse)));
	float lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
	vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
	float reduce = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
	float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
	dir = clamp(dir * rcp, -8.0, 8.0) * PX;
	vec3 a = 0.5 * (T(uv + dir * (1.0 / 3.0 - 0.5)) + T(uv + dir * (2.0 / 3.0 - 0.5)));
	vec3 b = a * 0.5 + 0.25 * (T(uv - dir * 0.5) + T(uv + dir * 0.5));
	float lb = L(b);
	return (lb < lmin || lb > lmax) ? a : b;
}`,
		// HDR : contraste local + courbe de tons ACES + éclat des couleurs.
		hdr: `
vec3 effect(vec2 uv) {
	vec3 c = T(uv);
	vec3 blur = (T(uv + vec2(2.0, 0.0) * PX) + T(uv - vec2(2.0, 0.0) * PX) + T(uv + vec2(0.0, 2.0) * PX) + T(uv - vec2(0.0, 2.0) * PX)) * 0.25;
	c += (c - blur) * 0.55;
	c *= 1.32;
	c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
	float l = L(c);
	return mix(vec3(l), c, 1.22);
}`,
		// Bloom : les zones lumineuses débordent doucement.
		bloom: `
vec3 effect(vec2 uv) {
	vec3 c = T(uv);
	vec3 glow = vec3(0.0);
	for (int i = 0; i < 12; i++) {
		float a = float(i) * 0.5236;
		vec2 o = vec2(cos(a), sin(a)) * PX * 3.0;
		glow += max(T(uv + o) - 0.55, 0.0) + max(T(uv + o * 2.0) - 0.55, 0.0) * 0.6;
	}
	return c + glow * 0.11;
}`,
		// Couleurs vives : saturation intelligente (vibrance) et courbe en S.
		vivid: `
vec3 effect(vec2 uv) {
	vec3 c = T(uv);
	float l = L(c);
	float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
	c = mix(vec3(l), c, 1.0 + 0.55 * (1.0 - sat));
	return mix(c, c * c * (3.0 - 2.0 * c), 0.35);
}`,
		// Cinéma : étalonnage sarcelle/orangé, grain de pellicule, vignette.
		cinema: `
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 effect(vec2 uv) {
	vec3 c = T(uv);
	float l = L(c);
	c = mix(c, c * vec3(0.85, 1.02, 1.12), (1.0 - l) * 0.5);
	c = mix(c, c * vec3(1.14, 1.0, 0.86), l * 0.45);
	vec2 n = uv * TextureSize / InputSize;
	c *= 1.0 - 0.55 * pow(length(n - 0.5) * 1.15, 2.4);
	c += (hash(n * InputSize + float(FrameCount)) - 0.5) * 0.045;
	return c;
}`,
		// Cartoon : couleurs en aplats et contours noirs.
		toon: `
vec3 effect(vec2 uv) {
	vec3 c = T(uv);
	float tl = L(T(uv + vec2(-1.0, -1.0) * PX)), t = L(T(uv + vec2(0.0, -1.0) * PX)), tr = L(T(uv + vec2(1.0, -1.0) * PX));
	float l = L(T(uv + vec2(-1.0, 0.0) * PX)), r = L(T(uv + vec2(1.0, 0.0) * PX));
	float bl = L(T(uv + vec2(-1.0, 1.0) * PX)), b = L(T(uv + vec2(0.0, 1.0) * PX)), br = L(T(uv + vec2(1.0, 1.0) * PX));
	float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
	float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
	float edge = smoothstep(0.25, 0.55, length(vec2(gx, gy)));
	c = floor(c * 6.0 + 0.5) / 6.0;
	return mix(c * 1.08, vec3(0.05), edge);
}`,
		// Rêve : halo doux et couleurs pastel.
		dream: `
vec3 effect(vec2 uv) {
	vec3 c = T(uv);
	vec3 soft = vec3(0.0);
	for (int i = 0; i < 8; i++) {
		float a = float(i) * 0.785;
		soft += T(uv + vec2(cos(a), sin(a)) * PX * 2.5);
	}
	soft /= 8.0;
	c = mix(c, max(c, soft), 0.6);
	return mix(vec3(L(c)), c, 1.15) * 1.05 + vec3(0.02, 0.0, 0.04);
}`,
		// Pixel net HD : agrandissement entier sans flou ni pixels irréguliers (sharp bilinear).
		pixel: `
vec3 effect(vec2 uv) {
	vec2 texel = uv * TextureSize;
	vec2 scale = max(floor(OutputSize / InputSize), vec2(1.0));
	vec2 s = fract(texel) - 0.5;
	vec2 range = 0.5 - 0.5 / scale;
	vec2 f = (s - clamp(s, -range, range)) * scale + 0.5;
	return T((floor(texel) + f) / TextureSize);
}`,
	};

	const src = name => ({ name: `smash-${name}.glsl`, type: 'text', value: HEADER + EFFECTS[name] + FOOTER });

	// passes : [nom de l'effet, échelle (1 = taille d'entrée, 0 = taille de sortie), filtrage linéaire]
	const preset = (passes) => {
		let glslp = `shaders = ${passes.length}\n`;
		passes.forEach(([fx, scale, linear], i) => {
			glslp += `shader${i} = smash-${fx}.glsl\nfilter_linear${i} = ${linear === false ? 'false' : 'true'}\n`;
			if (scale) glslp += `scale_type${i} = source\nscale${i} = ${scale.toFixed(1)}\n`;
		});
		return { shader: { type: 'text', value: glslp }, resources: [...new Set(passes.map(p => p[0]))].map(src) };
	};

	window.EJS_shaders = {
		'smash-superres': preset([['fxaa', 2], ['cas', 0]]),
		'smash-ultra': preset([['fxaa', 2], ['cas', 0], ['hdr', 0]]),
		'smash-sharp': preset([['cas', 0]]),
		'smash-fxaa': preset([['fxaa', 0]]),
		'smash-hdr': preset([['hdr', 0]]),
		'smash-bloom': preset([['bloom', 0]]),
		'smash-vivid': preset([['vivid', 0]]),
		'smash-cinema': preset([['cinema', 0]]),
		'smash-toon': preset([['toon', 0]]),
		'smash-dream': preset([['dream', 0]]),
		'smash-pixel': preset([['pixel', 0]]),
	};
})();
