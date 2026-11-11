// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = Symbol();
// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
	return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};
// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = Object.create(null)) => {
	const { all = false, dot = false } = options;
	const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
	if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
		all,
		dot
	});
	return {};
};
/**
* Parses form data from a request.
*
* @template T - The type of the parsed body data.
* @param {HonoRequest | Request} request - The request object containing form data.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {Promise<T>} The parsed body data.
*/
async function parseFormData(request, options) {
	if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
	const headers = isRawRequest(request) ? request.headers : request.raw.headers;
	const formDataPromise = bufferToFormData(await request.arrayBuffer(), headers.get("Content-Type") || "");
	if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
	const formData = await formDataPromise;
	if (formData) return convertFormDataToBodyData(formData, options);
	return {};
}
/**
* Converts form data to body data based on the provided options.
*
* @template T - The type of the parsed body data.
* @param {FormData} formData - The form data to convert.
* @param {ParseBodyOptions} options - Options for parsing the form data.
* @returns {T} The converted body data.
*/
function convertFormDataToBodyData(formData, options) {
	const form = Object.create(null);
	const nestingState = { count: 0 };
	formData.forEach((value, key) => {
		if (!(options.all || key.endsWith("[]"))) form[key] = value;
		else handleParsingAllValues(form, key, value);
	});
	if (options.dot) Object.entries(form).forEach(([key, value]) => {
		if (key.includes(".")) {
			handleParsingNestedValues(form, key, value, nestingState);
			delete form[key];
		}
	});
	return form;
}
/**
* Handles parsing all values for a given key, supporting multiple values as arrays.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The key to parse.
* @param {FormDataEntryValue} value - The value to assign.
*/
var handleParsingAllValues = (form, key, value) => {
	if (form[key] !== void 0) {
		if (Array.isArray(form[key])) form[key].push(value);
		else form[key] = [form[key], value];
	} else if (!key.endsWith("[]")) form[key] = value;
	else form[key] = [value];
};
/**
* Handles parsing nested values using dot notation keys.
*
* @param {BodyData} form - The form data object.
* @param {string} key - The dot notation key.
* @param {BodyDataValue} value - The value to assign.
*/
var handleParsingNestedValues = (form, key, value, state) => {
	if (/(?:^|\.)__proto__\./.test(key)) return;
	let nestedForm = form;
	const keys = key.split(".", 34);
	if (keys.length > 33) throwNestingLimitExceeded();
	keys.forEach((key, index) => {
		if (index === keys.length - 1) nestedForm[key] = value;
		else {
			if (!nestedForm[key] || typeof nestedForm[key] !== "object" || Array.isArray(nestedForm[key]) || nestedForm[key] instanceof File) {
				if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
				nestedForm[key] = Object.create(null);
			}
			nestedForm = nestedForm[key];
		}
	});
};
var throwNestingLimitExceeded = () => {
	throw new Error("Nesting limit exceeded");
};
// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
	const paths = path.split("/");
	if (paths[0] === "") paths.shift();
	return paths;
};
var splitRoutingPath = (routePath) => {
	const { groups, path } = extractGroupsFromPath(routePath);
	return replaceGroupMarks(splitPath(path), groups);
};
var extractGroupsFromPath = (path) => {
	const groups = [];
	path = path.replace(/\{[^}]+\}/g, (match, index) => {
		const mark = `@${index}`;
		groups.push([mark, match]);
		return mark;
	});
	return {
		groups,
		path
	};
};
var replaceGroupMarks = (paths, groups) => {
	for (let i = groups.length - 1; i >= 0; i--) {
		const [mark] = groups[i];
		for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
			paths[j] = paths[j].replace(mark, groups[i][1]);
			break;
		}
	}
	return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
	if (label === "*") return "*";
	const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
	if (match) {
		const cacheKey = `${label}#${next}`;
		if (!patternCache[cacheKey]) {
			if (match[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
				cacheKey,
				match[1],
				new RegExp(`^${match[2]}(?=/${next})`)
			] : [
				label,
				match[1],
				new RegExp(`^${match[2]}$`)
			];
			else patternCache[cacheKey] = [
				label,
				match[1],
				true
			];
		}
		return patternCache[cacheKey];
	}
	return null;
};
var tryDecode = (str, decoder) => {
	try {
		return decoder(str);
	} catch {
		return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match) => {
			try {
				return decoder(match);
			} catch {
				return match;
			}
		});
	}
};
/**
* Try to apply decodeURI() to given string.
* If it fails, skip invalid percent encoding or invalid UTF-8 sequences, and apply decodeURI() to the rest as much as possible.
* @param str The string to decode.
* @returns The decoded string that sometimes contains undecodable percent encoding.
* @example
* tryDecodeURI('Hello%20World') // 'Hello World'
* tryDecodeURI('Hello%20World/%A4%A2') // 'Hello World/%A4%A2'
*/
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
	const url = request.url;
	const start = url.indexOf("/", url.indexOf(":") + 4);
	let i = start;
	for (; i < url.length; i++) {
		const charCode = url.charCodeAt(i);
		if (charCode === 37) {
			const queryIndex = url.indexOf("?", i);
			const hashIndex = url.indexOf("#", i);
			const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
			const path = url.slice(start, end);
			return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
		} else if (charCode === 63 || charCode === 35) break;
	}
	return url.slice(start, i);
};
var getPathNoStrict = (request) => {
	const result = getPath(request);
	return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var stripPathPrefix = (rawPath, decodedPath, prefixLength) => {
	if (rawPath.at(-1) === "/" && decodedPath.at(-1) !== "/") rawPath = rawPath.slice(0, -1);
	let index = 0;
	for (let i = decodedPath.indexOf("/"); i !== -1 && i < prefixLength; i = decodedPath.indexOf("/", i + 1)) {
		index = rawPath.indexOf("/", index + 1);
		if (index === -1) return "/";
	}
	return rawPath.slice(index) || "/";
};
/**
* Merge paths.
* @param {string[]} ...paths - The paths to merge.
* @returns {string} The merged path.
* @example
* mergePath('/api', '/users') // '/api/users'
* mergePath('/api/', '/users') // '/api/users'
* mergePath('/api', '/') // '/api'
* mergePath('/api/', '/') // '/api/'
*/
var mergePath = (base, sub, ...rest) => {
	if (rest.length) sub = mergePath(sub, ...rest);
	return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
	if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
	const segments = path.split("/");
	const results = [];
	let basePath = "";
	segments.forEach((segment) => {
		if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
		else if (/\:/.test(segment)) {
			if (segment.charCodeAt(segment.length - 1) === 63) {
				if (results.length === 0 && basePath === "") results.push("/");
				else results.push(basePath);
				const optionalSegment = segment.slice(0, -1);
				basePath += "/" + optionalSegment;
				results.push(basePath);
			} else basePath += "/" + segment;
		}
	});
	return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
	if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
	return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
	const hashIndex = url.indexOf("#", 8);
	if (hashIndex !== -1) url = url.slice(0, hashIndex);
	let encoded;
	if (!multiple && key && !/[%+&=]/.test(key)) {
		const queryIndex = url.indexOf("?", 8);
		let keyIndex = queryIndex;
		if (keyIndex === -1) return;
		if (!url.startsWith(key, keyIndex + 1)) keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		while (keyIndex !== -1) {
			const trailingKeyCode = url.charCodeAt(keyIndex + key.length + 1);
			if (trailingKeyCode === 61 || trailingKeyCode === 38 || isNaN(trailingKeyCode)) {
				if (keyIndex > queryIndex && /(?:^|&)[^=&]*[%+]/.test(url.slice(queryIndex + 1, keyIndex))) break;
				if (trailingKeyCode === 61) {
					const valueIndex = keyIndex + key.length + 2;
					const endIndex = url.indexOf("&", valueIndex);
					return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
				}
				return "";
			}
			keyIndex = url.indexOf(`&${key}`, keyIndex + 1);
		}
		encoded = /[%+]/.test(url);
		if (!encoded) return;
	}
	const results = Object.create(null);
	encoded ??= /[%+]/.test(url);
	let keyIndex = url.indexOf("?", 8);
	while (keyIndex !== -1) {
		const nextKeyIndex = url.indexOf("&", keyIndex + 1);
		let valueIndex = url.indexOf("=", keyIndex);
		if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
		let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
		if (encoded) name = _decodeURI(name);
		keyIndex = nextKeyIndex;
		if (name === "") continue;
		let value;
		if (valueIndex === -1) value = "";
		else {
			value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
			if (encoded) value = _decodeURI(value);
		}
		if (multiple) {
			if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
			results[name].push(value);
		} else results[name] ??= value;
	}
	return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
	return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;
// node_modules/hono/dist/request.js
var HonoRequest = class {
	/**
	* `.raw` can get the raw Request object.
	*
	* @see {@link https://hono.dev/docs/api/request#raw}
	*
	* @example
	* ```ts
	* // For Cloudflare Workers
	* app.post('/', async (c) => {
	*   const metadata = c.req.raw.cf?.hostMetadata?
	*   ...
	* })
	* ```
	*/
	raw;
	#validatedData;
	#matchResult;
	routeIndex = 0;
	/**
	* `.path` can get the pathname of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#path}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const pathname = c.req.path // `/about/me`
	* })
	* ```
	*/
	path;
	bodyCache = {};
	constructor(request, path = "/", matchResult = [[]]) {
		this.raw = request;
		this.path = path;
		this.#matchResult = matchResult;
	}
	param(key) {
		return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
	}
	#getDecodedParam(key) {
		const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
		const param = this.#getParamValue(paramKey);
		return param && tryDecodeURIComponent(param);
	}
	#getAllDecodedParams() {
		const decoded = {};
		const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
		for (const key of keys) {
			const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
			if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
		}
		return decoded;
	}
	#getParamValue(paramKey) {
		return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
	}
	query(key) {
		return getQueryParam(this.url, key);
	}
	queries(key) {
		return getQueryParams(this.url, key);
	}
	header(name) {
		if (name) return this.raw.headers.get(name) ?? void 0;
		const headerData = Object.create(null);
		this.raw.headers.forEach((value, key) => {
			headerData[key] = value;
		});
		return headerData;
	}
	async parseBody(options) {
		return parseBody(this, options);
	}
	#cachedBody = (key) => {
		const { bodyCache, raw } = this;
		const cachedBody = bodyCache[key];
		if (cachedBody) return cachedBody;
		for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
			if (anyCachedKey === "json") body = JSON.stringify(body);
			const contentType = anyCachedKey === "formData" ? void 0 : raw.headers.get("content-type");
			return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
		});
		return bodyCache[key] = raw[key]();
	};
	/**
	* `.json()` can parse Request body of type `application/json`
	*
	* @see {@link https://hono.dev/docs/api/request#json}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.json()
	* })
	* ```
	*/
	json() {
		return this.#cachedBody("text").then((text) => JSON.parse(text));
	}
	/**
	* `.text()` can parse Request body of type `text/plain`
	*
	* @see {@link https://hono.dev/docs/api/request#text}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.text()
	* })
	* ```
	*/
	text() {
		return this.#cachedBody("text");
	}
	/**
	* `.arrayBuffer()` parse Request body as an `ArrayBuffer`
	*
	* @see {@link https://hono.dev/docs/api/request#arraybuffer}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.arrayBuffer()
	* })
	* ```
	*/
	arrayBuffer() {
		return this.#cachedBody("arrayBuffer");
	}
	/**
	* `.bytes()` parses the request body as a `Uint8Array`.
	*
	* @see {@link https://hono.dev/docs/api/request#bytes}
	*
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.bytes()
	* })
	* ```
	*/
	bytes() {
		return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
	}
	/**
	* Parses the request body as a `Blob`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.blob();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#blob
	*/
	blob() {
		return this.#cachedBody("blob");
	}
	/**
	* Parses the request body as `FormData`.
	* @example
	* ```ts
	* app.post('/entry', async (c) => {
	*   const body = await c.req.formData();
	* });
	* ```
	* @see https://hono.dev/docs/api/request#formdata
	*/
	formData() {
		return this.#cachedBody("formData");
	}
	/**
	* Adds validated data to the request.
	*
	* @param target - The target of the validation.
	* @param data - The validated data to add.
	*/
	addValidatedData(target, data) {
		(this.#validatedData ??= {})[target] = data;
	}
	valid(target) {
		return this.#validatedData?.[target];
	}
	/**
	* `.url` can get the request url strings.
	*
	* @see {@link https://hono.dev/docs/api/request#url}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const url = c.req.url // `http://localhost:8787/about/me`
	*   ...
	* })
	* ```
	*/
	get url() {
		return this.raw.url;
	}
	/**
	* `.method` can get the method name of the request.
	*
	* @see {@link https://hono.dev/docs/api/request#method}
	*
	* @example
	* ```ts
	* app.get('/about/me', (c) => {
	*   const method = c.req.method // `GET`
	* })
	* ```
	*/
	get method() {
		return this.raw.method;
	}
	get [GET_MATCH_RESULT]() {
		return this.#matchResult;
	}
	/**
	* `.matchedRoutes` can return a matched route in the handler
	*
	* @deprecated
	*
	* Use matchedRoutes helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#matchedroutes}
	*
	* @example
	* ```ts
	* app.use('*', async function logger(c, next) {
	*   await next()
	*   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
	*     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
	*     console.log(
	*       method,
	*       ' ',
	*       path,
	*       ' '.repeat(Math.max(10 - path.length, 0)),
	*       name,
	*       i === c.req.routeIndex ? '<- respond from here' : ''
	*     )
	*   })
	* })
	* ```
	*/
	get matchedRoutes() {
		return this.#matchResult[0].map(([[, route]]) => route);
	}
	/**
	* `.routePath` can retrieve the path registered within the handler
	*
	* @deprecated
	*
	* Use routePath helper defined in "hono/route" instead.
	*
	* @see {@link https://hono.dev/docs/api/request#routepath}
	*
	* @example
	* ```ts
	* app.get('/posts/:id', (c) => {
	*   return c.json({ path: c.req.routePath })
	* })
	* ```
	*/
	get routePath() {
		return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
	}
};
// node_modules/hono/dist/utils/html.js
/**
* @module
* HTML utility.
*/
var HtmlEscapedCallbackPhase = {
	Stringify: 1,
	BeforeStream: 2,
	Stream: 3
};
var raw = (value, callbacks) => {
	const escapedString = new String(value);
	escapedString.isEscaped = true;
	escapedString.callbacks = callbacks;
	return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
	if (typeof str === "object" && !(str instanceof String)) {
		if (!(str instanceof Promise)) str = str.toString();
		if (str instanceof Promise) str = await str;
	}
	const callbacks = str.callbacks;
	if (!callbacks?.length) return Promise.resolve(str);
	if (buffer) buffer[0] += str;
	else buffer = [str];
	const resStr = Promise.all(callbacks.map((c) => c({
		phase,
		buffer,
		context
	}))).then((res) => Promise.all(res.filter(Boolean).map((str) => resolveCallback(str, phase, false, context, buffer))).then(() => buffer[0]));
	if (preserveCallbacks) return raw(await resStr, callbacks);
	else return resStr;
};
// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
	return {
		"Content-Type": contentType,
		...headers
	};
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
	#rawRequest;
	#req;
	/**
	* `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
	*
	* @see {@link https://hono.dev/docs/api/context#env}
	*
	* @example
	* ```ts
	* // Environment object for Cloudflare Workers
	* app.get('*', async c => {
	*   const counter = c.env.COUNTER
	* })
	* ```
	*/
	env = {};
	#var;
	finalized = false;
	/**
	* `.error` can get the error object from the middleware if the Handler throws an error.
	*
	* @see {@link https://hono.dev/docs/api/context#error}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   await next()
	*   if (c.error) {
	*     // do something...
	*   }
	* })
	* ```
	*/
	error;
	#status;
	#executionCtx;
	#res;
	#layout;
	#renderer;
	#notFoundHandler;
	#preparedHeaders;
	#matchResult;
	#path;
	/**
	* Creates an instance of the Context class.
	*
	* @param req - The Request object.
	* @param options - Optional configuration options for the context.
	*/
	constructor(req, options) {
		this.#rawRequest = req;
		if (options) {
			this.#executionCtx = options.executionCtx;
			this.env = options.env;
			this.#notFoundHandler = options.notFoundHandler;
			this.#path = options.path;
			this.#matchResult = options.matchResult;
		}
	}
	/**
	* `.req` is the instance of {@link HonoRequest}.
	*/
	get req() {
		this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
		return this.#req;
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#event}
	* The FetchEvent associated with the current request.
	*
	* @throws Will throw an error if the context does not have a FetchEvent.
	*/
	get event() {
		if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no FetchEvent");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#executionctx}
	* The ExecutionContext associated with the current request.
	*
	* @throws Will throw an error if the context does not have an ExecutionContext.
	*/
	get executionCtx() {
		if (this.#executionCtx) return this.#executionCtx;
		else throw Error("This context has no ExecutionContext");
	}
	/**
	* @see {@link https://hono.dev/docs/api/context#res}
	* The Response object for the current request.
	*/
	get res() {
		return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
	}
	/**
	* Sets the Response object for the current request.
	*
	* @param _res - The Response object to set.
	*/
	set res(_res) {
		if (this.#res && _res) {
			_res = createResponseInstance(_res.body, _res);
			for (const [k, v] of this.#res.headers.entries()) {
				if (k === "content-type") continue;
				if (k === "set-cookie") {
					const cookies = this.#res.headers.getSetCookie();
					_res.headers.delete("set-cookie");
					for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
				} else _res.headers.set(k, v);
			}
		}
		this.#res = _res;
		this.finalized = true;
	}
	/**
	* `.render()` can create a response within a layout.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   return c.render('Hello!')
	* })
	* ```
	*/
	render = (...args) => {
		this.#renderer ??= (content) => this.html(content);
		return this.#renderer(...args);
	};
	/**
	* Sets the layout for the response.
	*
	* @param layout - The layout to set.
	* @returns The layout function.
	*/
	setLayout = (layout) => this.#layout = layout;
	/**
	* Gets the current layout for the response.
	*
	* @returns The current layout function.
	*/
	getLayout = () => this.#layout;
	/**
	* `.setRenderer()` can set the layout in the custom middleware.
	*
	* @see {@link https://hono.dev/docs/api/context#render-setrenderer}
	*
	* @example
	* ```tsx
	* app.use('*', async (c, next) => {
	*   c.setRenderer((content) => {
	*     return c.html(
	*       <html>
	*         <body>
	*           <p>{content}</p>
	*         </body>
	*       </html>
	*     )
	*   })
	*   await next()
	* })
	* ```
	*/
	setRenderer = (renderer) => {
		this.#renderer = renderer;
	};
	/**
	* `.header()` can set headers.
	*
	* @see {@link https://hono.dev/docs/api/context#header}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*
	*   // Append multiple headers using the append option (e.g. Vary)
	*   c.header('Vary', 'Accept-Encoding', { append: true })
	*   c.header('Vary', 'User-Agent', { append: true })
	*
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	header = (name, value, options) => {
		if (this.finalized && !this.#res.bodyUsed) this.#res = createResponseInstance(this.#res.body, this.#res);
		const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
		if (value === void 0) headers.delete(name);
		else if (options?.append) headers.append(name, value);
		else headers.set(name, value);
	};
	status = (status) => {
		this.#status = status;
	};
	/**
	* `.set()` can set the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.use('*', async (c, next) => {
	*   c.set('message', 'Hono is hot!!')
	*   await next()
	* })
	* ```
	*/
	set = (key, value) => {
		this.#var ??= /* @__PURE__ */ new Map();
		this.#var.set(key, value);
	};
	/**
	* `.get()` can use the value specified by the key.
	*
	* @see {@link https://hono.dev/docs/api/context#set-get}
	*
	* @example
	* ```ts
	* app.get('/', (c) => {
	*   const message = c.get('message')
	*   return c.text(`The message is "${message}"`)
	* })
	* ```
	*/
	get = (key) => {
		return this.#var ? this.#var.get(key) : void 0;
	};
	/**
	* `.var` can access the value of a variable.
	*
	* @see {@link https://hono.dev/docs/api/context#var}
	*
	* @example
	* ```ts
	* const result = c.var.client.oneMethod()
	* ```
	*/
	get var() {
		if (!this.#var) return {};
		return Object.fromEntries(this.#var);
	}
	#newResponse(data, arg, headers) {
		let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
		if (typeof arg === "object" && arg.headers) {
			responseHeaders ??= new Headers();
			for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
			else responseHeaders.set(key, value);
		}
		if (headers) {
			if (!responseHeaders) {
				let count = 0;
				for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
					responseHeaders = new Headers();
					break;
				}
			}
			if (responseHeaders) for (const k in headers) {
				const v = headers[k];
				if (typeof v === "string") responseHeaders.set(k, v);
				else {
					responseHeaders.delete(k);
					for (const v2 of v) responseHeaders.append(k, v2);
				}
			}
		}
		return createResponseInstance(data, {
			status: typeof arg === "number" ? arg : arg?.status ?? this.#status,
			headers: responseHeaders ?? headers
		});
	}
	newResponse = (...args) => this.#newResponse(...args);
	/**
	* `.body()` can return the HTTP response.
	* You can set headers with `.header()` and set HTTP status code with `.status`.
	* This can also be set in `.text()`, `.json()` and so on.
	*
	* @see {@link https://hono.dev/docs/api/context#body}
	*
	* @example
	* ```ts
	* app.get('/welcome', (c) => {
	*   // Set headers
	*   c.header('X-Message', 'Hello!')
	*   c.header('Content-Type', 'text/plain')
	*   // Set HTTP status code
	*   c.status(201)
	*
	*   // Return the response body
	*   return c.body('Thank you for coming')
	* })
	* ```
	*/
	body = (data, arg, headers) => this.#newResponse(data, arg, headers);
	/**
	* `.text()` can render text as `Content-Type:text/plain`.
	*
	* @see {@link https://hono.dev/docs/api/context#text}
	*
	* @example
	* ```ts
	* app.get('/say', (c) => {
	*   return c.text('Hello!')
	* })
	* ```
	*/
	text = (text, arg, headers) => {
		return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
	};
	/**
	* `.json()` can render JSON as `Content-Type:application/json`.
	*
	* @see {@link https://hono.dev/docs/api/context#json}
	*
	* @example
	* ```ts
	* app.get('/api', (c) => {
	*   return c.json({ message: 'Hello!' })
	* })
	* ```
	*/
	json = (object, arg, headers) => {
		return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
	};
	html = (html, arg, headers) => {
		const res = (html) => this.#newResponse(html, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
		return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
	};
	/**
	* `.redirect()` can Redirect, default status code is 302.
	*
	* @see {@link https://hono.dev/docs/api/context#redirect}
	*
	* @example
	* ```ts
	* app.get('/redirect', (c) => {
	*   return c.redirect('/')
	* })
	* app.get('/redirect-permanently', (c) => {
	*   return c.redirect('/', 301)
	* })
	* ```
	*/
	redirect = (location, status) => {
		const locationString = String(location);
		this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
		return this.newResponse(null, status ?? 302);
	};
	/**
	* `.notFound()` can return the Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/context#notfound}
	*
	* @example
	* ```ts
	* app.get('/notfound', (c) => {
	*   return c.notFound()
	* })
	* ```
	*/
	notFound = () => {
		this.#notFoundHandler ??= () => createResponseInstance();
		return this.#notFoundHandler(this);
	};
};
// node_modules/hono/dist/compose.js
/**
* Compose middleware functions into a single function based on `koa-compose` package.
*
* @template E - The environment type.
*
* @param {[[Function, unknown], unknown][] | [[Function]][]} middleware - An array of middleware functions and their corresponding parameters.
* @param {ErrorHandler<E>} [onError] - An optional error handler function.
* @param {NotFoundHandler<E>} [onNotFound] - An optional not-found handler function.
*
* @returns {(context: Context, next?: Next) => Promise<Context>} - A composed middleware function.
*/
var compose = (middleware, onError, onNotFound) => {
	return (context, next) => {
		let index = -1;
		return dispatch(0);
		/**
		* Dispatch the middleware functions.
		*
		* @param {number} i - The current index in the middleware array.
		*
		* @returns {Promise<Context>} - A promise that resolves to the context.
		*/
		async function dispatch(i) {
			if (i <= index) throw new Error("next() called multiple times");
			index = i;
			let res;
			let isError = false;
			let handler;
			if (middleware[i]) {
				handler = middleware[i][0][0];
				context.req.routeIndex = i;
			} else handler = i === middleware.length && next || void 0;
			if (handler) try {
				res = await handler(context, () => dispatch(i + 1));
			} catch (err) {
				if (err instanceof Error && onError) {
					context.error = err;
					res = await onError(err, context);
					isError = true;
				} else throw err;
			}
			else if (context.finalized === false && onNotFound) res = await onNotFound(context);
			if (res && (context.finalized === false || isError)) context.res = res;
			return context;
		}
	};
};
// node_modules/hono/dist/router.js
/**
* Array of supported HTTP methods.
*/
var METHODS = [
	"get",
	"post",
	"put",
	"delete",
	"options",
	"patch",
	"query"
];
/**
* Error message indicating that a route cannot be added because the matcher is already built.
*/
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
/**
* Error class representing an unsupported path error.
*/
var UnsupportedPathError = class extends Error {};
// node_modules/hono/dist/utils/constants.js
/**
* Constant used to mark a composed handler.
*/
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";
// node_modules/hono/dist/utils/mount.js
var getPathPrefixLength = (c, pathPrefix, routePath) => {
	if (!/[:*]/.test(pathPrefix)) return pathPrefix.length;
	const path = c.req.path;
	const matchResult = c.req[GET_MATCH_RESULT];
	const paramNames = /* @__PURE__ */ new Set();
	let length = 0;
	for (const part of splitRoutingPath(pathPrefix)) {
		const pattern = getPattern(part);
		if (pattern && pattern !== "*") {
			const name = pattern[1];
			if (paramNames.has(name)) throw new Error(`mount(): Duplicate path parameter "${name}" in "${routePath}".`);
			paramNames.add(name);
		}
		if (pattern && pattern !== "*" && pattern[2] !== true) {
			const value = matchResult.length === 2 ? matchResult[1][matchResult[0][c.req.routeIndex][1][pattern[1]]] : matchResult[0][c.req.routeIndex][1][pattern[1]];
			length += value.length + 1;
		} else if (pattern || part.endsWith("*")) {
			const end = path.indexOf("/", length + 1);
			length = end === -1 ? path.length : end;
		} else length += part.length + 1;
	}
	return length;
};
var createMountedRequest = (c, pathPrefix, routePath) => {
	if (/[^/]\*$/.test(routePath)) throw new Error(`mount(): Wildcard must follow "/" in "${routePath}".`);
	const url = new URL(c.req.raw.url);
	url.pathname = stripPathPrefix(url.pathname, c.req.path, getPathPrefixLength(c, pathPrefix, routePath));
	return new Request(url, c.req.raw);
};
// node_modules/hono/dist/hono-base.js
/**
* @module
* This module is the base module for the Hono object.
*/
var notFoundHandler = (c) => {
	return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
	if ("getResponse" in err) {
		const res = err.getResponse();
		return c.newResponse(res.body, res);
	}
	console.error(err);
	return c.text("Internal Server Error", 500);
};
var Hono$1 = class Hono {
	get;
	post;
	put;
	delete;
	options;
	patch;
	query;
	all;
	on;
	use;
	router;
	getPath;
	_basePath = "/";
	#path = "/";
	routes = [];
	constructor(options = {}) {
		[...METHODS, "all"].forEach((method) => {
			this[method] = (args1, ...args) => {
				const methodName = method.toUpperCase();
				if (typeof args1 === "string") this.#path = args1;
				else this.#addRoute(methodName, this.#path, args1);
				args.forEach((handler) => {
					this.#addRoute(methodName, this.#path, handler);
				});
				return this;
			};
		});
		this.on = (method, path, ...handlers) => {
			for (const p of [path].flat()) {
				this.#path = p;
				for (const m of [method].flat()) {
					const methodName = m.toUpperCase();
					for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
				}
			}
			return this;
		};
		this.use = (arg1, ...handlers) => {
			if (typeof arg1 === "string") this.#path = arg1;
			else {
				this.#path = "*";
				handlers.unshift(arg1);
			}
			handlers.forEach((handler) => {
				this.#addRoute("ALL", this.#path, handler);
			});
			return this;
		};
		const { strict, ...optionsWithoutStrict } = options;
		Object.assign(this, optionsWithoutStrict);
		this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
	}
	#clone() {
		const clone = new Hono({
			router: this.router,
			getPath: this.getPath
		});
		clone.errorHandler = this.errorHandler;
		clone.#notFoundHandler = this.#notFoundHandler;
		clone.routes = this.routes;
		return clone;
	}
	#notFoundHandler = notFoundHandler;
	errorHandler = errorHandler;
	/**
	* `.route()` allows grouping other Hono instance in routes.
	*
	* @see {@link https://hono.dev/docs/api/routing#grouping}
	*
	* @param {string} path - base Path
	* @param {Hono} app - other Hono instance
	* @returns {Hono} routed Hono instance
	*
	* @example
	* ```ts
	* const app = new Hono()
	* const app2 = new Hono()
	*
	* app2.get("/user", (c) => c.text("user"))
	* app.route("/api", app2) // GET /api/user
	* ```
	*/
	route(path, app) {
		const subApp = this.basePath(path);
		app.routes.map((r) => {
			let handler;
			if (app.errorHandler === errorHandler) handler = r.handler;
			else {
				handler = async (c, next) => (await compose([], app.errorHandler)(c, () => r.handler(c, next))).res;
				handler[COMPOSED_HANDLER] = r.handler;
			}
			subApp.#addRoute(r.method, r.path, handler, r.basePath);
		});
		return this;
	}
	/**
	* `.basePath()` allows base paths to be specified.
	*
	* @see {@link https://hono.dev/docs/api/routing#base-path}
	*
	* @param {string} path - base Path
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* const api = new Hono().basePath('/api')
	* ```
	*/
	basePath(path) {
		const subApp = this.#clone();
		subApp._basePath = mergePath(this._basePath, path);
		return subApp;
	}
	/**
	* `.onError()` handles an error and returns a customized Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#error-handling}
	*
	* @param {ErrorHandler} handler - request Handler for error
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.onError((err, c) => {
	*   console.error(`${err}`)
	*   return c.text('Custom Error Message', 500)
	* })
	* ```
	*/
	onError = (handler) => {
		this.errorHandler = handler;
		return this;
	};
	/**
	* `.notFound()` allows you to customize a Not Found Response.
	*
	* @see {@link https://hono.dev/docs/api/hono#not-found}
	*
	* @param {NotFoundHandler} handler - request handler for not-found
	* @returns {Hono} changed Hono instance
	*
	* @example
	* ```ts
	* app.notFound((c) => {
	*   return c.text('Custom 404 Message', 404)
	* })
	* ```
	*/
	notFound = (handler) => {
		this.#notFoundHandler = handler;
		return this;
	};
	/**
	* `.mount()` allows you to mount applications built with other frameworks into your Hono application.
	*
	* @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
	*
	* @see {@link https://hono.dev/docs/api/hono#mount}
	*
	* @param {string} path - base Path
	* @param {Function} applicationHandler - other Request Handler
	* @param {MountOptions} [options] - options of `.mount()`
	* @returns {Hono} mounted Hono instance
	*
	* @example
	* ```ts
	* import { Router as IttyRouter } from 'itty-router'
	* import { Hono } from 'hono'
	* // Create itty-router application
	* const ittyRouter = IttyRouter()
	* // GET /itty-router/hello
	* ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
	*
	* const app = new Hono()
	* app.mount('/itty-router', ittyRouter.handle)
	* ```
	*
	* @example
	* ```ts
	* const app = new Hono()
	* // Send the request to another application without modification.
	* app.mount('/app', anotherApp, {
	*   replaceRequest: (req) => req,
	* })
	* ```
	*/
	mount(path, applicationHandler, options) {
		let replaceRequest;
		let optionHandler;
		if (options) {
			if (typeof options === "function") optionHandler = options;
			else {
				optionHandler = options.optionHandler;
				if (options.replaceRequest === false) replaceRequest = (request) => request;
				else replaceRequest = options.replaceRequest;
			}
		}
		const getOptions = optionHandler ? (c) => {
			const options = optionHandler(c);
			return Array.isArray(options) ? options : [options];
		} : (c) => {
			let executionContext = void 0;
			try {
				executionContext = c.executionCtx;
			} catch {}
			return [c.env, executionContext];
		};
		const mergedPath = mergePath(this._basePath, path);
		const defaultReplaceRequest = (c) => createMountedRequest(c, mergedPath.replace(/\/$/, ""), mergePath(mergedPath, "*"));
		const handler = async (c, next) => {
			const res = await applicationHandler(replaceRequest ? replaceRequest(c.req.raw) : defaultReplaceRequest(c), ...getOptions(c));
			if (res) return res;
			await next();
		};
		this.#addRoute("ALL", mergePath(path, "*"), handler);
		return this;
	}
	#addRoute(method, path, handler, baseRoutePath) {
		path = mergePath(this._basePath, path);
		const r = {
			basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
			path,
			method,
			handler
		};
		this.router.add(method, path, [handler, r]);
		this.routes.push(r);
	}
	#handleError(err, c) {
		if (err instanceof Error) return this.errorHandler(err, c);
		throw err;
	}
	#dispatch(request, executionCtx, env, method) {
		if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
		const path = this.getPath(request, { env });
		const matchResult = this.router.match(method, path);
		const c = new Context(request, {
			path,
			matchResult,
			env,
			executionCtx,
			notFoundHandler: this.#notFoundHandler
		});
		if (matchResult[0].length === 1) {
			let res;
			try {
				res = matchResult[0][0][0][0](c, async () => {
					c.res = await this.#notFoundHandler(c);
				});
			} catch (err) {
				return this.#handleError(err, c);
			}
			return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
		}
		const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
		return (async () => {
			try {
				const context = await composed(c);
				if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
				return context.res;
			} catch (err) {
				return this.#handleError(err, c);
			}
		})();
	}
	/**
	* `.fetch()` will be entry point of your app.
	*
	* @see {@link https://hono.dev/docs/api/hono#fetch}
	*
	* @param {Request} request - request Object of request
	* @param {Env} env - env Object
	* @param {ExecutionContext} executionCtx - context of execution
	* @returns {Response | Promise<Response>} response of request
	*
	*/
	fetch = (request, ...rest) => {
		return this.#dispatch(request, rest[1], rest[0], request.method);
	};
	/**
	* `.request()` is a useful method for testing.
	* You can pass a URL or pathname to send a GET request.
	* app will return a Response object.
	* ```ts
	* test('GET /hello is ok', async () => {
	*   const res = await app.request('/hello')
	*   expect(res.status).toBe(200)
	* })
	* ```
	* @see https://hono.dev/docs/api/hono#request
	*/
	request = (input, requestInit, Env, executionCtx) => {
		if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
		input = input.toString();
		return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
	};
	/**
	* `.fire()` automatically adds a global fetch event listener.
	* This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
	* @deprecated
	* Use `fire` from `hono/service-worker` instead.
	* ```ts
	* import { Hono } from 'hono'
	* import { fire } from 'hono/service-worker'
	*
	* const app = new Hono()
	* // ...
	* fire(app)
	* ```
	* @see https://hono.dev/docs/api/hono#fire
	* @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
	* @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
	*/
	fire = () => {
		addEventListener("fetch", (event) => {
			event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
		});
	};
};
// node_modules/hono/dist/router/utils.js
var createNullObject = () => Object.create(null);
// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
	const matchers = this.buildAllMatchers();
	const match = ((method, path) => {
		const matcher = matchers[method] || matchers["ALL"];
		const staticMatch = matcher[2][path];
		if (staticMatch) return staticMatch;
		const match = path.match(matcher[0]);
		if (!match) return [[], emptyParam];
		const index = match.indexOf("", 1);
		return [matcher[1][index], match];
	});
	this.match = match;
	return match(method, path);
}
// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = "[^]*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/[^]*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
/**
* Sort order:
* 1. literal
* 2. special pattern (e.g. :label{[0-9]+})
* 3. common label pattern (e.g. :label)
* 4. wildcard
*/
function compareKey(a, b) {
	if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
	if (b.length === 1) return 1;
	if (a === "[^]*" || a === "(?:|/[^]*)") return b === "[^]*" ? -1 : 1;
	else if (b === "[^]*" || b === "(?:|/[^]*)") return -1;
	if (a === "[^/]+") return 1;
	else if (b === "[^/]+") return -1;
	return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node$1 = class Node {
	#index;
	#varIndex;
	#children = createNullObject();
	insert(tokens, index, paramMap, context, keys) {
		let node = this;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const token = tokens[i];
			const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
				"",
				"",
				ONLY_WILDCARD_REG_EXP_STR
			] : [
				"",
				"",
				LABEL_REG_EXP_STR
			] : null : token === "/*" ? [
				"",
				"",
				TAIL_WILDCARD_REG_EXP_STR
			] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
			let nextNode;
			if (pattern) {
				const name = pattern[1];
				let regexpStr = pattern[2] || "[^/]+";
				if (name && pattern[2]) {
					if (new RegExp(regexpStr).test("")) throw PATH_ERROR;
					regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
					if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
					if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
				}
				keys.push(regexpStr);
				nextNode = node.#children[regexpStr];
				if (!nextNode) {
					if (regexpStr !== "[^]*" && regexpStr !== "(?:|/[^]*)") {
						for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
					}
					nextNode = node.#children[regexpStr] = new Node();
				}
				if (name !== "") {
					nextNode.#varIndex ??= context.varIndex++;
					paramMap.push([name, nextNode.#varIndex]);
				}
			} else {
				keys.push(token);
				nextNode = node.#children[token];
				if (!nextNode) {
					for (const k in node.#children) if (k.length > 1 && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
					nextNode = node.#children[token] = new Node();
				}
			}
			node = nextNode;
		}
		if (node.#index !== void 0) throw PATH_ERROR;
		node.#index = index;
	}
	buildRegExpStr() {
		const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
			const c = this.#children[k];
			const childStr = c.buildRegExpStr();
			return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
		}).filter(Boolean);
		if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
		if (strList.length === 0) return "";
		if (strList.length === 1) return strList[0];
		return "(?:" + strList.join("|") + ")";
	}
};
// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
	#context = { varIndex: 0 };
	#root = new Node$1();
	#index = 0;
	paths = createNullObject();
	insert(path, isStatic) {
		const keys = [];
		if (isStatic) {
			this.#root.insert(path.split(""), -1, [], this.#context, keys);
			this.paths[path] = [
				-1,
				[],
				keys
			];
			return;
		}
		const paramAssoc = [];
		const groups = [];
		let markedPath = path;
		for (let i = 0;;) {
			let replaced = false;
			markedPath = markedPath.replace(/\{(?:\{[\d,]+\}|[^}])+\}/g, (m) => {
				const mark = `@\\${i}`;
				groups[i] = [mark, m];
				i++;
				replaced = true;
				return mark;
			});
			if (!replaced) break;
		}
		/**
		*  - pattern (:label, :label{0-9]+}, ...)
		*  - /* wildcard
		*  - character
		*/
		const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./gs) || [];
		for (let i = groups.length - 1; i >= 0; i--) {
			const [mark] = groups[i];
			for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
				tokens[j] = tokens[j].replace(mark, groups[i][1]);
				break;
			}
		}
		this.#root.insert(tokens, this.#index, paramAssoc, this.#context, keys);
		this.paths[path] = [
			this.#index++,
			paramAssoc,
			keys
		];
	}
	buildRegExp() {
		let regexp = this.#root.buildRegExpStr();
		if (regexp === "") return [
			/^$/,
			[],
			[]
		];
		let captureIndex = 0;
		const indexReplacementMap = [];
		const paramReplacementMap = [];
		regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
			if (handlerIndex !== void 0) {
				indexReplacementMap[++captureIndex] = Number(handlerIndex);
				return "$()";
			}
			if (paramIndex !== void 0) {
				paramReplacementMap[Number(paramIndex)] = ++captureIndex;
				return "";
			}
			return "";
		});
		return [
			new RegExp(`^${regexp}`),
			indexReplacementMap,
			paramReplacementMap
		];
	}
};
// node_modules/hono/dist/router/reg-exp-router/router.js
function endsWithWildcard(keys) {
	const tail = keys[keys.length - 1];
	return tail === "[^]*" || tail === "(?:|/[^]*)";
}
function covers(wildcard, target) {
	const last = wildcard.length - 1;
	for (let i = 0; i < last; i++) if (wildcard[i] !== target[i]) return false;
	return wildcard[last] === "[^]*" || target.length === last || target[last] === "/";
}
var RegExpRouter = class {
	name = "RegExpRouter";
	#handlers;
	#tries;
	constructor() {
		this.#handlers = { ["ALL"]: [] };
		this.#tries = { ["ALL"]: new Trie() };
	}
	#insertPath(method, path) {
		try {
			this.#tries[method].insert(path, !/\*|\/:/.test(path));
		} catch (e) {
			throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
		}
	}
	add(method, path, handler) {
		const handlers = this.#handlers;
		if (!handlers) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		const tries = this.#tries;
		if (!handlers[method]) {
			tries[method] = new Trie();
			handlers[method] = [...handlers["ALL"]];
			for (const p in tries["ALL"].paths) this.#insertPath(method, p);
		}
		if (path === "/*") path = "*";
		const methods = method === "ALL" ? Object.keys(handlers) : [method];
		const paths = checkOptionalParameter(path) || [path];
		for (const path of paths) for (const m of methods) {
			if (!tries[m].paths[path]) this.#insertPath(m, path);
			handlers[m].push([handler, path]);
		}
	}
	match = match;
	buildAllMatchers() {
		const matchers = createNullObject();
		for (const method of Object.keys(this.#handlers)) matchers[method] = this.#buildMatcher(method);
		this.#handlers = this.#tries = void 0;
		return matchers;
	}
	#buildMatcher(method) {
		const handlers = this.#handlers[method];
		const trie = this.#tries[method];
		const staticMap = createNullObject();
		const handlerData = [];
		const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
		const own = createNullObject();
		const entries = handlers.map(([h, p], i) => {
			(own[p] ??= []).push(i);
			return [h, trie.paths[p][1].reduceRight((map, [key, varIndex]) => {
				map[key] = paramReplacementMap[varIndex];
				return map;
			}, createNullObject())];
		});
		const wildcards = Object.keys(own).filter((p) => endsWithWildcard(trie.paths[p][2]));
		for (const path in trie.paths) {
			const [index, , keys] = trie.paths[path];
			const indexes = [...own[path]];
			for (const p of wildcards) if (p !== path && covers(trie.paths[p][2], keys)) indexes.push(...own[p]);
			const data = indexes.sort((a, b) => a - b).map((i) => entries[i]);
			if (index === -1) {
				const last = Math.max(-1, ...data.flatMap(([, map]) => Object.values(map)));
				staticMap[path] = [data, last === -1 ? emptyParam : path.match(regexp).slice(0, last + 1)];
			} else handlerData[index] = data;
		}
		return [
			regexp,
			indexReplacementMap.map((i) => handlerData[i]),
			staticMap
		];
	}
};
// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
	name = "SmartRouter";
	#routers = [];
	#routes = [];
	constructor(init) {
		this.#routers = init.routers;
	}
	add(method, path, handler) {
		if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
		this.#routes.push([
			method,
			path,
			handler
		]);
	}
	match(method, path) {
		if (!this.#routes) throw new Error("Fatal error");
		const routers = this.#routers;
		const routes = this.#routes;
		const len = routers.length;
		let i = 0;
		let res;
		for (; i < len; i++) {
			const router = routers[i];
			try {
				for (let i = 0, len = routes.length; i < len; i++) router.add(...routes[i]);
				res = router.match(method, path);
			} catch (e) {
				if (e instanceof UnsupportedPathError) continue;
				throw e;
			}
			this.match = router.match.bind(router);
			this.#routers = [router];
			this.#routes = void 0;
			break;
		}
		if (i === len) throw new Error("Fatal error");
		this.name = `SmartRouter + ${this.activeRouter.name}`;
		return res;
	}
	get activeRouter() {
		if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
		return this.#routers[0];
	}
};
// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node = class Node {
	#methods = [];
	#children = createNullObject();
	#patterns = [];
	#pattern;
	#params = emptyParams;
	insert(method, path, handler) {
		let curNode = this;
		const parts = splitRoutingPath(path);
		const possibleKeys = /* @__PURE__ */ new Set();
		let i = 0;
		for (const p of parts) {
			const nextP = parts[++i];
			const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
			const isParam = Array.isArray(pattern);
			const key = isParam ? pattern[0] : pattern || p;
			const child = curNode.#children[key] ||= new Node();
			if (pattern && !child.#pattern) {
				child.#pattern = pattern;
				curNode.#patterns.push(child);
			}
			curNode = child;
			if (isParam) possibleKeys.add(pattern[1]);
		}
		curNode.#methods.push({ [method]: {
			handler,
			possibleKeys: [...possibleKeys],
			score: ++order
		} });
	}
	#pushHandlerSets(handlerSets, node, method, nodeParams, params) {
		for (let i = 0, len = node.#methods.length; i < len; i++) {
			const m = node.#methods[i];
			const handlerSet = m[method] || m["ALL"];
			if (handlerSet) {
				handlerSet.params = createNullObject();
				handlerSets.push(handlerSet);
				for (let i = 0, len = handlerSet.possibleKeys.length; i < len; i++) {
					const key = handlerSet.possibleKeys[i];
					handlerSet.params[key] = params?.[key] && !i ? params[key] : nodeParams[key] ?? params?.[key];
				}
			}
		}
	}
	search(method, path) {
		const handlerSets = [];
		this.#params = emptyParams;
		let curNodes = [this];
		const parts = splitPath(path);
		const curNodesQueue = [];
		const len = parts.length;
		let partOffsets = null;
		for (let i = 0; i < len; i++) {
			const part = parts[i];
			const isLast = i === len - 1;
			const tempNodes = [];
			for (let j = 0, len2 = curNodes.length; j < len2; j++) {
				const node = curNodes[j];
				const nextNode = node.#children[part];
				if (nextNode) {
					nextNode.#params = node.#params;
					if (isLast) {
						if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
						this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
					} else tempNodes.push(nextNode);
				}
				for (const child of node.#patterns) {
					const pattern = child.#pattern;
					const params = node.#params === emptyParams ? {} : { ...node.#params };
					if (typeof pattern === "string") {
						if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
							this.#pushHandlerSets(handlerSets, child, method, node.#params);
							if (pattern === "*") {
								child.#params = params;
								tempNodes.push(child);
							}
						}
						continue;
					}
					const [, name, matcher] = pattern;
					if (!part && matcher === true) continue;
					if (matcher !== true) {
						if (!partOffsets) {
							partOffsets = [];
							let offset = path[0] === "/" ? 1 : 0;
							for (let p = 0; p < len; p++) {
								partOffsets[p] = offset;
								offset += parts[p].length + 1;
							}
						}
						const restPathString = path.slice(partOffsets[i]);
						const m = matcher.exec(restPathString);
						if (m) {
							if (!Object.hasOwn(params, name)) params[name] = m[0];
							this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
							if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
							for (const _ in child.#children) {
								child.#params = params;
								const componentCount = m[0].match(/\//g)?.length ?? 0;
								(curNodesQueue[componentCount] ||= []).push(child);
								break;
							}
							continue;
						}
					}
					if (matcher === true || matcher.test(part)) {
						if (!Object.hasOwn(params, name)) params[name] = part;
						if (isLast) {
							this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
							if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
						} else {
							child.#params = params;
							tempNodes.push(child);
						}
					}
				}
			}
			const shifted = curNodesQueue.shift();
			curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
		}
		if (handlerSets[1]) handlerSets.sort((a, b) => {
			return a.score - b.score;
		});
		return [handlerSets.map(({ handler, params }) => [handler, params])];
	}
};
// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
	name = "TrieRouter";
	#node = new Node();
	add(method, path, handler) {
		for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
	}
	match(method, path) {
		return this.#node.search(method, path);
	}
};
// node_modules/hono/dist/hono.js
/**
* The Hono class extends the functionality of the HonoBase class.
* It sets up routing and allows for custom options to be passed.
*
* @template E - The environment type.
* @template S - The schema type.
* @template BasePath - The base path type.
*/
var Hono = class extends Hono$1 {
	/**
	* Creates an instance of the Hono class.
	*
	* @param options - Optional configuration options for the Hono instance.
	*/
	constructor(options = {}) {
		super(options);
		this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
	}
};
// node_modules/hono/dist/middleware/cors/index.js
/**
* CORS Middleware for Hono.
*
* @see {@link https://hono.dev/docs/middleware/builtin/cors}
*
* @param {CORSOptions} [options] - The options for the CORS middleware.
* @param {string | string[] | ((origin: string, c: Context) => Promise<string | undefined | null> | string | undefined | null)} [options.origin='*'] - The value of "Access-Control-Allow-Origin" CORS header.
* @param {string[] | ((origin: string, c: Context) => Promise<string[]> | string[])} [options.allowMethods=['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'QUERY']] - The value of "Access-Control-Allow-Methods" CORS header.
* @param {string[]} [options.allowHeaders=[]] - The value of "Access-Control-Allow-Headers" CORS header.
* @param {number} [options.maxAge] - The value of "Access-Control-Max-Age" CORS header.
* @param {boolean} [options.credentials] - The value of "Access-Control-Allow-Credentials" CORS header.
* @param {string[]} [options.exposeHeaders=[]] - The value of "Access-Control-Expose-Headers" CORS header.
* @returns {MiddlewareHandler} The middleware handler function.
*
* @example
* ```ts
* const app = new Hono()
*
* app.use('/api/*', cors())
* app.use(
*   '/api2/*',
*   cors({
*     origin: 'http://example.com',
*     allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
*     allowMethods: ['POST', 'GET', 'OPTIONS'],
*     exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
*     maxAge: 600,
*     credentials: true,
*   })
* )
*
* app.all('/api/abc', (c) => {
*   return c.json({ success: true })
* })
* app.all('/api2/abc', (c) => {
*   return c.json({ success: true })
* })
* ```
*/
var cors = (options) => {
	const opts = {
		origin: "*",
		allowMethods: [
			"GET",
			"HEAD",
			"PUT",
			"POST",
			"DELETE",
			"PATCH",
			"QUERY"
		],
		allowHeaders: [],
		exposeHeaders: [],
		...options
	};
	const exposeHeadersStr = opts.exposeHeaders?.length ? opts.exposeHeaders.join(",") : void 0;
	const allowHeadersStr = opts.allowHeaders?.length ? opts.allowHeaders.join(",") : void 0;
	const findAllowOrigin = ((optsOrigin) => {
		if (typeof optsOrigin === "string") {
			if (optsOrigin === "*") return () => optsOrigin;
			else return (origin) => optsOrigin === origin ? origin : null;
		} else if (typeof optsOrigin === "function") return optsOrigin;
		else return (origin) => optsOrigin.includes(origin) ? origin : null;
	})(opts.origin);
	const findAllowMethods = ((optsAllowMethods) => {
		if (typeof optsAllowMethods === "function") return async (origin, c) => (await optsAllowMethods(origin, c)).join(",");
		else if (Array.isArray(optsAllowMethods)) {
			const methodsStr = optsAllowMethods.join(",");
			return () => methodsStr;
		} else return () => "";
	})(opts.allowMethods);
	return async function cors(c, next) {
		function set(key, value) {
			c.res.headers.set(key, value);
		}
		const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
		if (allowOrigin) set("Access-Control-Allow-Origin", allowOrigin);
		if (opts.credentials) set("Access-Control-Allow-Credentials", "true");
		if (exposeHeadersStr) set("Access-Control-Expose-Headers", exposeHeadersStr);
		if (c.req.method === "OPTIONS") {
			if (opts.origin !== "*") c.res.headers.append("Vary", "Origin");
			if (opts.maxAge != null) set("Access-Control-Max-Age", opts.maxAge.toString());
			const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
			if (allowMethods) set("Access-Control-Allow-Methods", allowMethods);
			let headersStr = allowHeadersStr;
			if (!headersStr) {
				const requestHeaders = c.req.header("Access-Control-Request-Headers");
				if (requestHeaders) headersStr = requestHeaders.split(",").map((h) => h.trim()).join(",");
			}
			if (headersStr) {
				set("Access-Control-Allow-Headers", headersStr);
				c.res.headers.append("Vary", "Access-Control-Request-Headers");
			}
			c.res.headers.delete("Content-Length");
			c.res.headers.delete("Content-Type");
			return new Response(null, {
				headers: c.res.headers,
				status: 204,
				statusText: "No Content"
			});
		}
		await next();
		if (opts.origin !== "*") c.header("Vary", "Origin", { append: true });
	};
};
// node_modules/astronomy-engine/esm/astronomy.js
/**
@preserve

Astronomy library for JavaScript (browser and Node.js).
https://github.com/cosinekitty/astronomy

MIT License

Copyright (c) 2019-2023 Don Cross <cosinekitty@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
/**
* @fileoverview Astronomy calculation library for browser scripting and Node.js.
* @author Don Cross <cosinekitty@gmail.com>
* @license MIT
*/
/**
* @brief The speed of light in AU/day.
*/
var C_AUDAY = 173.1446326846693;
/**
* @brief The number of kilometers per astronomical unit.
*/
var KM_PER_AU = 149597870.69098932;
/**
* @brief The factor to convert degrees to radians = pi/180.
*/
var DEG2RAD = .017453292519943295;
/**
* @brief The factor to convert sidereal hours to radians = pi/12.
*/
var HOUR2RAD = .26179938779914946;
/**
* @brief The factor to convert radians to degrees = 180/pi.
*/
var RAD2DEG = 57.29577951308232;
/**
* @brief The factor to convert radians to sidereal hours = 12/pi.
*/
var RAD2HOUR = 3.819718634205488;
var DAYS_PER_TROPICAL_YEAR = 365.24217;
var J2000 = /* @__PURE__ */ new Date("2000-01-01T12:00:00Z");
var PI2 = 2 * Math.PI;
var ARC = 3600 * (180 / Math.PI);
var ASEC2RAD = 484813681109536e-20;
var ASEC180 = 648e3;
var ASEC360 = 2 * ASEC180;
var ANGVEL = 7292115e-11;
var SUN_MAG_1AU = -.17 - 5 * Math.log10(ASEC180 / Math.PI);
var SECONDS_PER_DAY = 86400;
var SOLAR_DAYS_PER_SIDEREAL_DAY = .9972695717592592;
var SUN_RADIUS_AU = 695700 / KM_PER_AU;
var EARTH_FLATTENING = .996647180302104;
var EARTH_FLATTENING_SQUARED = EARTH_FLATTENING * EARTH_FLATTENING;
var EARTH_EQUATORIAL_RADIUS_KM = 6378.1366;
var EARTH_EQUATORIAL_RADIUS_AU = EARTH_EQUATORIAL_RADIUS_KM / KM_PER_AU;
var MOON_EQUATORIAL_RADIUS_AU = 1738.1 / KM_PER_AU;
var REFRACTION_NEAR_HORIZON = 34 / 60;
var SUN_GM = .0002959122082855911;
var JUPITER_GM = 2.825345909524226e-7;
var SATURN_GM = 8.459715185680659e-8;
var URANUS_GM = 1.292024916781969e-8;
var NEPTUNE_GM = 1.524358900784276e-8;
function VerifyBoolean(b) {
	if (b !== true && b !== false) {
		console.trace();
		throw `Value is not boolean: ${b}`;
	}
	return b;
}
function VerifyNumber(x) {
	if (!Number.isFinite(x)) {
		console.trace();
		throw `Value is not a finite number: ${x}`;
	}
	return x;
}
function Frac(x) {
	return x - Math.floor(x);
}
/**
* @brief Calculates the angle in degrees between two vectors.
*
* Given a pair of vectors, this function returns the angle in degrees
* between the two vectors in 3D space.
* The angle is measured in the plane that contains both vectors.
*
* @param {Vector} a
*      The first of a pair of vectors between which to measure an angle.
*
* @param {Vector} b
*      The second of a pair of vectors between which to measure an angle.
*
* @returns {number}
*      The angle between the two vectors expressed in degrees.
*      The value is in the range [0, 180].
*/
function AngleBetween(a, b) {
	const aa = a.x * a.x + a.y * a.y + a.z * a.z;
	if (Math.abs(aa) < 1e-8) throw `AngleBetween: first vector is too short.`;
	const bb = b.x * b.x + b.y * b.y + b.z * b.z;
	if (Math.abs(bb) < 1e-8) throw `AngleBetween: second vector is too short.`;
	const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / Math.sqrt(aa * bb);
	if (dot <= -1) return 180;
	if (dot >= 1) return 0;
	return RAD2DEG * Math.acos(dot);
}
/**
* @brief String constants that represent the solar system bodies supported by Astronomy Engine.
*
* The following strings represent solar system bodies supported by various Astronomy Engine functions.
* Not every body is supported by every function; consult the documentation for each function
* to find which bodies it supports.
*
* "Sun", "Moon", "Mercury", "Venus", "Earth", "Mars", "Jupiter",
* "Saturn", "Uranus", "Neptune", "Pluto",
* "SSB" (Solar System Barycenter),
* "EMB" (Earth/Moon Barycenter)
*
* You can also use enumeration syntax for the bodies, like
* `Astronomy.Body.Moon`, `Astronomy.Body.Jupiter`, etc.
*
* @enum {string}
*/
var Body;
(function(Body) {
	Body["Sun"] = "Sun";
	Body["Moon"] = "Moon";
	Body["Mercury"] = "Mercury";
	Body["Venus"] = "Venus";
	Body["Earth"] = "Earth";
	Body["Mars"] = "Mars";
	Body["Jupiter"] = "Jupiter";
	Body["Saturn"] = "Saturn";
	Body["Uranus"] = "Uranus";
	Body["Neptune"] = "Neptune";
	Body["Pluto"] = "Pluto";
	Body["SSB"] = "SSB";
	Body["EMB"] = "EMB";
	Body["Star1"] = "Star1";
	Body["Star2"] = "Star2";
	Body["Star3"] = "Star3";
	Body["Star4"] = "Star4";
	Body["Star5"] = "Star5";
	Body["Star6"] = "Star6";
	Body["Star7"] = "Star7";
	Body["Star8"] = "Star8";
})(Body || (Body = {}));
var StarList = [
	Body.Star1,
	Body.Star2,
	Body.Star3,
	Body.Star4,
	Body.Star5,
	Body.Star6,
	Body.Star7,
	Body.Star8
];
var StarTable = [
	{
		ra: 0,
		dec: 0,
		dist: 0
	},
	{
		ra: 0,
		dec: 0,
		dist: 0
	},
	{
		ra: 0,
		dec: 0,
		dist: 0
	},
	{
		ra: 0,
		dec: 0,
		dist: 0
	},
	{
		ra: 0,
		dec: 0,
		dist: 0
	},
	{
		ra: 0,
		dec: 0,
		dist: 0
	},
	{
		ra: 0,
		dec: 0,
		dist: 0
	},
	{
		ra: 0,
		dec: 0,
		dist: 0
	}
];
function GetStar(body) {
	const index = StarList.indexOf(body);
	return index >= 0 ? StarTable[index] : null;
}
function UserDefinedStar(body) {
	const star = GetStar(body);
	return star && star.dist > 0 ? star : null;
}
var PrecessDirection;
(function(PrecessDirection) {
	PrecessDirection[PrecessDirection["From2000"] = 0] = "From2000";
	PrecessDirection[PrecessDirection["Into2000"] = 1] = "Into2000";
})(PrecessDirection || (PrecessDirection = {}));
var vsop = {
	Mercury: [
		[[
			[
				4.40250710144,
				0,
				0
			],
			[
				.40989414977,
				1.48302034195,
				26087.9031415742
			],
			[
				.050462942,
				4.47785489551,
				52175.8062831484
			],
			[
				.00855346844,
				1.16520322459,
				78263.70942472259
			],
			[
				.00165590362,
				4.11969163423,
				104351.61256629678
			],
			[
				.00034561897,
				.77930768443,
				130439.51570787099
			],
			[
				7583476e-11,
				3.71348404924,
				156527.41884944518
			]
		], [
			[
				26087.90313685529,
				0,
				0
			],
			[
				.01131199811,
				6.21874197797,
				26087.9031415742
			],
			[
				.00292242298,
				3.04449355541,
				52175.8062831484
			],
			[
				.00075775081,
				6.08568821653,
				78263.70942472259
			],
			[
				.00019676525,
				2.80965111777,
				104351.61256629678
			]
		]],
		[[
			[
				.11737528961,
				1.98357498767,
				26087.9031415742
			],
			[
				.02388076996,
				5.03738959686,
				52175.8062831484
			],
			[
				.01222839532,
				3.14159265359,
				0
			],
			[
				.0054325181,
				1.79644363964,
				78263.70942472259
			],
			[
				.0012977877,
				4.83232503958,
				104351.61256629678
			],
			[
				.00031866927,
				1.58088495658,
				130439.51570787099
			],
			[
				7963301e-11,
				4.60972126127,
				156527.41884944518
			]
		], [[
			.00274646065,
			3.95008450011,
			26087.9031415742
		], [
			.00099737713,
			3.14159265359,
			0
		]]],
		[[
			[
				.39528271651,
				0,
				0
			],
			[
				.07834131818,
				6.19233722598,
				26087.9031415742
			],
			[
				.00795525558,
				2.95989690104,
				52175.8062831484
			],
			[
				.00121281764,
				6.01064153797,
				78263.70942472259
			],
			[
				.00021921969,
				2.77820093972,
				104351.61256629678
			],
			[
				4354065e-11,
				5.82894543774,
				130439.51570787099
			]
		], [[
			.0021734774,
			4.65617158665,
			26087.9031415742
		], [
			.00044141826,
			1.42385544001,
			52175.8062831484
		]]]
	],
	Venus: [
		[[
			[
				3.17614666774,
				0,
				0
			],
			[
				.01353968419,
				5.59313319619,
				10213.285546211
			],
			[
				.00089891645,
				5.30650047764,
				20426.571092422
			],
			[
				5477194e-11,
				4.41630661466,
				7860.4193924392
			],
			[
				3455741e-11,
				2.6996444782,
				11790.6290886588
			],
			[
				2372061e-11,
				2.99377542079,
				3930.2096962196
			],
			[
				1317168e-11,
				5.18668228402,
				26.2983197998
			],
			[
				1664146e-11,
				4.25018630147,
				1577.3435424478
			],
			[
				1438387e-11,
				4.15745084182,
				9683.5945811164
			],
			[
				1200521e-11,
				6.15357116043,
				30639.856638633
			]
		], [
			[
				10213.28554621638,
				0,
				0
			],
			[
				.00095617813,
				2.4640651111,
				10213.285546211
			],
			[
				7787201e-11,
				.6247848222,
				20426.571092422
			]
		]],
		[[
			[
				.05923638472,
				.26702775812,
				10213.285546211
			],
			[
				.00040107978,
				1.14737178112,
				20426.571092422
			],
			[
				.00032814918,
				3.14159265359,
				0
			]
		], [[
			.00287821243,
			1.88964962838,
			10213.285546211
		]]],
		[[
			[
				.72334820891,
				0,
				0
			],
			[
				.00489824182,
				4.02151831717,
				10213.285546211
			],
			[
				1658058e-11,
				4.90206728031,
				20426.571092422
			],
			[
				1378043e-11,
				1.12846591367,
				11790.6290886588
			],
			[
				1632096e-11,
				2.84548795207,
				7860.4193924392
			],
			[
				498395e-11,
				2.58682193892,
				9683.5945811164
			],
			[
				221985e-11,
				2.01346696541,
				19367.1891622328
			],
			[
				237454e-11,
				2.55136053886,
				15720.8387848784
			]
		], [[
			.00034551041,
			.89198706276,
			10213.285546211
		]]]
	],
	Earth: [
		[
			[
				[
					1.75347045673,
					0,
					0
				],
				[
					.03341656453,
					4.66925680415,
					6283.0758499914
				],
				[
					.00034894275,
					4.62610242189,
					12566.1516999828
				],
				[
					3417572e-11,
					2.82886579754,
					3.523118349
				],
				[
					3497056e-11,
					2.74411783405,
					5753.3848848968
				],
				[
					3135899e-11,
					3.62767041756,
					77713.7714681205
				],
				[
					2676218e-11,
					4.41808345438,
					7860.4193924392
				],
				[
					2342691e-11,
					6.13516214446,
					3930.2096962196
				],
				[
					1273165e-11,
					2.03709657878,
					529.6909650946
				],
				[
					1324294e-11,
					.74246341673,
					11506.7697697936
				],
				[
					901854e-11,
					2.04505446477,
					26.2983197998
				],
				[
					1199167e-11,
					1.10962946234,
					1577.3435424478
				],
				[
					857223e-11,
					3.50849152283,
					398.1490034082
				],
				[
					779786e-11,
					1.17882681962,
					5223.6939198022
				],
				[
					99025e-10,
					5.23268072088,
					5884.9268465832
				],
				[
					753141e-11,
					2.53339052847,
					5507.5532386674
				],
				[
					505267e-11,
					4.58292599973,
					18849.2275499742
				],
				[
					492392e-11,
					4.20505711826,
					775.522611324
				],
				[
					356672e-11,
					2.91954114478,
					.0673103028
				],
				[
					284125e-11,
					1.89869240932,
					796.2980068164
				],
				[
					242879e-11,
					.34481445893,
					5486.777843175
				],
				[
					317087e-11,
					5.84901948512,
					11790.6290886588
				],
				[
					271112e-11,
					.31486255375,
					10977.078804699
				],
				[
					206217e-11,
					4.80646631478,
					2544.3144198834
				],
				[
					205478e-11,
					1.86953770281,
					5573.1428014331
				],
				[
					202318e-11,
					2.45767790232,
					6069.7767545534
				],
				[
					126225e-11,
					1.08295459501,
					20.7753954924
				],
				[
					155516e-11,
					.83306084617,
					213.299095438
				]
			],
			[
				[
					6283.0758499914,
					0,
					0
				],
				[
					.00206058863,
					2.67823455808,
					6283.0758499914
				],
				[
					4303419e-11,
					2.63512233481,
					12566.1516999828
				]
			],
			[[
				8721859e-11,
				1.07253635559,
				6283.0758499914
			]]
		],
		[[], [[
			.00227777722,
			3.4137662053,
			6283.0758499914
		], [
			3805678e-11,
			3.37063423795,
			12566.1516999828
		]]],
		[
			[
				[
					1.00013988784,
					0,
					0
				],
				[
					.01670699632,
					3.09846350258,
					6283.0758499914
				],
				[
					.00013956024,
					3.05524609456,
					12566.1516999828
				],
				[
					308372e-10,
					5.19846674381,
					77713.7714681205
				],
				[
					1628463e-11,
					1.17387558054,
					5753.3848848968
				],
				[
					1575572e-11,
					2.84685214877,
					7860.4193924392
				],
				[
					924799e-11,
					5.45292236722,
					11506.7697697936
				],
				[
					542439e-11,
					4.56409151453,
					3930.2096962196
				],
				[
					47211e-10,
					3.66100022149,
					5884.9268465832
				],
				[
					8.5831e-7,
					1.27079125277,
					161000.6857376741
				],
				[
					5.7056e-7,
					2.01374292245,
					83996.84731811189
				],
				[
					5.5736e-7,
					5.2415979917,
					71430.69561812909
				],
				[
					174844e-11,
					3.01193636733,
					18849.2275499742
				],
				[
					243181e-11,
					4.2734953079,
					11790.6290886588
				]
			],
			[[
				.00103018607,
				1.10748968172,
				6283.0758499914
			], [
				1721238e-11,
				1.06442300386,
				12566.1516999828
			]],
			[[
				4359385e-11,
				5.78455133808,
				6283.0758499914
			]]
		]
	],
	Mars: [
		[
			[
				[
					6.20347711581,
					0,
					0
				],
				[
					.18656368093,
					5.0503710027,
					3340.6124266998
				],
				[
					.01108216816,
					5.40099836344,
					6681.2248533996
				],
				[
					.00091798406,
					5.75478744667,
					10021.8372800994
				],
				[
					.00027744987,
					5.97049513147,
					3.523118349
				],
				[
					.00010610235,
					2.93958560338,
					2281.2304965106
				],
				[
					.00012315897,
					.84956094002,
					2810.9214616052
				],
				[
					8926784e-11,
					4.15697846427,
					.0172536522
				],
				[
					8715691e-11,
					6.11005153139,
					13362.4497067992
				],
				[
					6797556e-11,
					.36462229657,
					398.1490034082
				],
				[
					7774872e-11,
					3.33968761376,
					5621.8429232104
				],
				[
					3575078e-11,
					1.6618650571,
					2544.3144198834
				],
				[
					4161108e-11,
					.22814971327,
					2942.4634232916
				],
				[
					3075252e-11,
					.85696614132,
					191.4482661116
				],
				[
					2628117e-11,
					.64806124465,
					3337.0893083508
				],
				[
					2937546e-11,
					6.07893711402,
					.0673103028
				],
				[
					2389414e-11,
					5.03896442664,
					796.2980068164
				],
				[
					2579844e-11,
					.02996736156,
					3344.1355450488
				],
				[
					1528141e-11,
					1.14979301996,
					6151.533888305
				],
				[
					1798806e-11,
					.65634057445,
					529.6909650946
				],
				[
					1264357e-11,
					3.62275122593,
					5092.1519581158
				],
				[
					1286228e-11,
					3.06796065034,
					2146.1654164752
				],
				[
					1546404e-11,
					2.91579701718,
					1751.539531416
				],
				[
					1024902e-11,
					3.69334099279,
					8962.4553499102
				],
				[
					891566e-11,
					.18293837498,
					16703.062133499
				],
				[
					858759e-11,
					2.4009381194,
					2914.0142358238
				],
				[
					832715e-11,
					2.46418619474,
					3340.5951730476
				],
				[
					83272e-10,
					4.49495782139,
					3340.629680352
				],
				[
					712902e-11,
					3.66335473479,
					1059.3819301892
				],
				[
					748723e-11,
					3.82248614017,
					155.4203994342
				],
				[
					723861e-11,
					.67497311481,
					3738.761430108
				],
				[
					635548e-11,
					2.92182225127,
					8432.7643848156
				],
				[
					655162e-11,
					.48864064125,
					3127.3133312618
				],
				[
					550474e-11,
					3.81001042328,
					.9803210682
				],
				[
					55275e-10,
					4.47479317037,
					1748.016413067
				],
				[
					425966e-11,
					.55364317304,
					6283.0758499914
				],
				[
					415131e-11,
					.49662285038,
					213.299095438
				],
				[
					472167e-11,
					3.62547124025,
					1194.4470102246
				],
				[
					306551e-11,
					.38052848348,
					6684.7479717486
				],
				[
					312141e-11,
					.99853944405,
					6677.7017350506
				],
				[
					293198e-11,
					4.22131299634,
					20.7753954924
				],
				[
					302375e-11,
					4.48618007156,
					3532.0606928114
				],
				[
					274027e-11,
					.54222167059,
					3340.545116397
				],
				[
					281079e-11,
					5.88163521788,
					1349.8674096588
				],
				[
					231183e-11,
					1.28242156993,
					3870.3033917944
				],
				[
					283602e-11,
					5.7688543494,
					3149.1641605882
				],
				[
					236117e-11,
					5.75503217933,
					3333.498879699
				],
				[
					274033e-11,
					.13372524985,
					3340.6797370026
				],
				[
					299395e-11,
					2.78323740866,
					6254.6266625236
				]
			],
			[
				[
					3340.61242700512,
					0,
					0
				],
				[
					.01457554523,
					3.60433733236,
					3340.6124266998
				],
				[
					.00168414711,
					3.92318567804,
					6681.2248533996
				],
				[
					.00020622975,
					4.26108844583,
					10021.8372800994
				],
				[
					3452392e-11,
					4.7321039319,
					3.523118349
				],
				[
					2586332e-11,
					4.60670058555,
					13362.4497067992
				],
				[
					841535e-11,
					4.45864030426,
					2281.2304965106
				]
			],
			[[
				.00058152577,
				2.04961712429,
				3340.6124266998
			], [
				.00013459579,
				2.45738706163,
				6681.2248533996
			]]
		],
		[[
			[
				.03197134986,
				3.76832042431,
				3340.6124266998
			],
			[
				.00298033234,
				4.10616996305,
				6681.2248533996
			],
			[
				.00289104742,
				0,
				0
			],
			[
				.00031365539,
				4.4465105309,
				10021.8372800994
			],
			[
				34841e-9,
				4.7881254926,
				13362.4497067992
			]
		], [
			[
				.00217310991,
				6.04472194776,
				3340.6124266998
			],
			[
				.00020976948,
				3.14159265359,
				0
			],
			[
				.00012834709,
				1.60810667915,
				6681.2248533996
			]
		]],
		[
			[
				[
					1.53033488271,
					0,
					0
				],
				[
					.1418495316,
					3.47971283528,
					3340.6124266998
				],
				[
					.00660776362,
					3.81783443019,
					6681.2248533996
				],
				[
					.00046179117,
					4.15595316782,
					10021.8372800994
				],
				[
					8109733e-11,
					5.55958416318,
					2810.9214616052
				],
				[
					7485318e-11,
					1.77239078402,
					5621.8429232104
				],
				[
					5523191e-11,
					1.3643630377,
					2281.2304965106
				],
				[
					382516e-10,
					4.49407183687,
					13362.4497067992
				],
				[
					2306537e-11,
					.09081579001,
					2544.3144198834
				],
				[
					1999396e-11,
					5.36059617709,
					3337.0893083508
				],
				[
					2484394e-11,
					4.9254563992,
					2942.4634232916
				],
				[
					1960195e-11,
					4.74249437639,
					3344.1355450488
				],
				[
					1167119e-11,
					2.11260868341,
					5092.1519581158
				],
				[
					1102816e-11,
					5.00908403998,
					398.1490034082
				],
				[
					899066e-11,
					4.40791133207,
					529.6909650946
				],
				[
					992252e-11,
					5.83861961952,
					6151.533888305
				],
				[
					807354e-11,
					2.10217065501,
					1059.3819301892
				],
				[
					797915e-11,
					3.44839203899,
					796.2980068164
				],
				[
					740975e-11,
					1.49906336885,
					2146.1654164752
				]
			],
			[
				[
					.01107433345,
					2.03250524857,
					3340.6124266998
				],
				[
					.00103175887,
					2.37071847807,
					6681.2248533996
				],
				[
					128772e-9,
					0,
					0
				],
				[
					.0001081588,
					2.70888095665,
					10021.8372800994
				]
			],
			[[
				.00044242249,
				.47930604954,
				3340.6124266998
			], [
				8138042e-11,
				.86998389204,
				6681.2248533996
			]]
		]
	],
	Jupiter: [
		[
			[
				[
					.59954691494,
					0,
					0
				],
				[
					.09695898719,
					5.06191793158,
					529.6909650946
				],
				[
					.00573610142,
					1.44406205629,
					7.1135470008
				],
				[
					.00306389205,
					5.41734730184,
					1059.3819301892
				],
				[
					.00097178296,
					4.14264726552,
					632.7837393132
				],
				[
					.00072903078,
					3.64042916389,
					522.5774180938
				],
				[
					.00064263975,
					3.41145165351,
					103.0927742186
				],
				[
					.00039806064,
					2.29376740788,
					419.4846438752
				],
				[
					.00038857767,
					1.27231755835,
					316.3918696566
				],
				[
					.00027964629,
					1.7845459182,
					536.8045120954
				],
				[
					.0001358973,
					5.7748104079,
					1589.0728952838
				],
				[
					8246349e-11,
					3.5822792584,
					206.1855484372
				],
				[
					8768704e-11,
					3.63000308199,
					949.1756089698
				],
				[
					7368042e-11,
					5.0810119427,
					735.8765135318
				],
				[
					626315e-10,
					.02497628807,
					213.299095438
				],
				[
					6114062e-11,
					4.51319998626,
					1162.4747044078
				],
				[
					4905396e-11,
					1.32084470588,
					110.2063212194
				],
				[
					5305285e-11,
					1.30671216791,
					14.2270940016
				],
				[
					5305441e-11,
					4.18625634012,
					1052.2683831884
				],
				[
					4647248e-11,
					4.69958103684,
					3.9321532631
				],
				[
					3045023e-11,
					4.31676431084,
					426.598190876
				],
				[
					2609999e-11,
					1.56667394063,
					846.0828347512
				],
				[
					2028191e-11,
					1.06376530715,
					3.1813937377
				],
				[
					1764763e-11,
					2.14148655117,
					1066.49547719
				],
				[
					1722972e-11,
					3.88036268267,
					1265.5674786264
				],
				[
					1920945e-11,
					.97168196472,
					639.897286314
				],
				[
					1633223e-11,
					3.58201833555,
					515.463871093
				],
				[
					1431999e-11,
					4.29685556046,
					625.6701923124
				],
				[
					973272e-11,
					4.09764549134,
					95.9792272178
				]
			],
			[
				[
					529.69096508814,
					0,
					0
				],
				[
					.00489503243,
					4.2208293947,
					529.6909650946
				],
				[
					.00228917222,
					6.02646855621,
					7.1135470008
				],
				[
					.00030099479,
					4.54540782858,
					1059.3819301892
				],
				[
					.0002072092,
					5.45943156902,
					522.5774180938
				],
				[
					.00012103653,
					.16994816098,
					536.8045120954
				],
				[
					6067987e-11,
					4.42422292017,
					103.0927742186
				],
				[
					5433968e-11,
					3.98480737746,
					419.4846438752
				],
				[
					4237744e-11,
					5.89008707199,
					14.2270940016
				]
			],
			[
				[
					.00047233601,
					4.32148536482,
					7.1135470008
				],
				[
					.00030649436,
					2.929777887,
					529.6909650946
				],
				[
					.00014837605,
					3.14159265359,
					0
				]
			]
		],
		[[
			[
				.02268615702,
				3.55852606721,
				529.6909650946
			],
			[
				.00109971634,
				3.90809347197,
				1059.3819301892
			],
			[
				.00110090358,
				0,
				0
			],
			[
				8101428e-11,
				3.60509572885,
				522.5774180938
			],
			[
				6043996e-11,
				4.25883108339,
				1589.0728952838
			],
			[
				6437782e-11,
				.30627119215,
				536.8045120954
			]
		], [[
			.00078203446,
			1.52377859742,
			529.6909650946
		]]],
		[[
			[
				5.20887429326,
				0,
				0
			],
			[
				.25209327119,
				3.49108639871,
				529.6909650946
			],
			[
				.00610599976,
				3.84115365948,
				1059.3819301892
			],
			[
				.00282029458,
				2.57419881293,
				632.7837393132
			],
			[
				.00187647346,
				2.07590383214,
				522.5774180938
			],
			[
				.00086792905,
				.71001145545,
				419.4846438752
			],
			[
				.00072062974,
				.21465724607,
				536.8045120954
			],
			[
				.00065517248,
				5.9799588479,
				316.3918696566
			],
			[
				.00029134542,
				1.67759379655,
				103.0927742186
			],
			[
				.00030135335,
				2.16132003734,
				949.1756089698
			],
			[
				.00023453271,
				3.54023522184,
				735.8765135318
			],
			[
				.00022283743,
				4.19362594399,
				1589.0728952838
			],
			[
				.00023947298,
				.2745803748,
				7.1135470008
			],
			[
				.00013032614,
				2.96042965363,
				1162.4747044078
			],
			[
				970336e-10,
				1.90669633585,
				206.1855484372
			],
			[
				.00012749023,
				2.71550286592,
				1052.2683831884
			],
			[
				7057931e-11,
				2.18184839926,
				1265.5674786264
			],
			[
				6137703e-11,
				6.26418240033,
				846.0828347512
			],
			[
				2616976e-11,
				2.00994012876,
				1581.959348283
			]
		], [
			[
				.0127180152,
				2.64937512894,
				529.6909650946
			],
			[
				.00061661816,
				3.00076460387,
				1059.3819301892
			],
			[
				.00053443713,
				3.89717383175,
				522.5774180938
			],
			[
				.00031185171,
				4.88276958012,
				536.8045120954
			],
			[
				.00041390269,
				0,
				0
			]
		]]
	],
	Saturn: [
		[
			[
				[
					.87401354025,
					0,
					0
				],
				[
					.11107659762,
					3.96205090159,
					213.299095438
				],
				[
					.01414150957,
					4.58581516874,
					7.1135470008
				],
				[
					.00398379389,
					.52112032699,
					206.1855484372
				],
				[
					.00350769243,
					3.30329907896,
					426.598190876
				],
				[
					.00206816305,
					.24658372002,
					103.0927742186
				],
				[
					792713e-9,
					3.84007056878,
					220.4126424388
				],
				[
					.00023990355,
					4.66976924553,
					110.2063212194
				],
				[
					.00016573588,
					.43719228296,
					419.4846438752
				],
				[
					.00014906995,
					5.76903183869,
					316.3918696566
				],
				[
					.0001582029,
					.93809155235,
					632.7837393132
				],
				[
					.00014609559,
					1.56518472,
					3.9321532631
				],
				[
					.00013160301,
					4.44891291899,
					14.2270940016
				],
				[
					.00015053543,
					2.71669915667,
					639.897286314
				],
				[
					.00013005299,
					5.98119023644,
					11.0457002639
				],
				[
					.00010725067,
					3.12939523827,
					202.2533951741
				],
				[
					5863206e-11,
					.23656938524,
					529.6909650946
				],
				[
					5227757e-11,
					4.20783365759,
					3.1813937377
				],
				[
					6126317e-11,
					1.76328667907,
					277.0349937414
				],
				[
					5019687e-11,
					3.17787728405,
					433.7117378768
				],
				[
					459255e-10,
					.61977744975,
					199.0720014364
				],
				[
					4005867e-11,
					2.24479718502,
					63.7358983034
				],
				[
					2953796e-11,
					.98280366998,
					95.9792272178
				],
				[
					387367e-10,
					3.22283226966,
					138.5174968707
				],
				[
					2461186e-11,
					2.03163875071,
					735.8765135318
				],
				[
					3269484e-11,
					.77492638211,
					949.1756089698
				],
				[
					1758145e-11,
					3.2658010994,
					522.5774180938
				],
				[
					1640172e-11,
					5.5050445305,
					846.0828347512
				],
				[
					1391327e-11,
					4.02333150505,
					323.5054166574
				],
				[
					1580648e-11,
					4.37265307169,
					309.2783226558
				],
				[
					1123498e-11,
					2.83726798446,
					415.5524906121
				],
				[
					1017275e-11,
					3.71700135395,
					227.5261894396
				],
				[
					848642e-11,
					3.1915017083,
					209.3669421749
				]
			],
			[
				[
					213.2990952169,
					0,
					0
				],
				[
					.01297370862,
					1.82834923978,
					213.299095438
				],
				[
					.00564345393,
					2.88499717272,
					7.1135470008
				],
				[
					.00093734369,
					1.06311793502,
					426.598190876
				],
				[
					.00107674962,
					2.27769131009,
					206.1855484372
				],
				[
					.00040244455,
					2.04108104671,
					220.4126424388
				],
				[
					.00019941774,
					1.2795439047,
					103.0927742186
				],
				[
					.00010511678,
					2.7488034213,
					14.2270940016
				],
				[
					6416106e-11,
					.38238295041,
					639.897286314
				],
				[
					4848994e-11,
					2.43037610229,
					419.4846438752
				],
				[
					4056892e-11,
					2.92133209468,
					110.2063212194
				],
				[
					3768635e-11,
					3.6496533078,
					3.9321532631
				]
			],
			[
				[
					.0011644133,
					1.17988132879,
					7.1135470008
				],
				[
					.00091841837,
					.0732519584,
					213.299095438
				],
				[
					.00036661728,
					0,
					0
				],
				[
					.00015274496,
					4.06493179167,
					206.1855484372
				]
			]
		],
		[[
			[
				.04330678039,
				3.60284428399,
				213.299095438
			],
			[
				.00240348302,
				2.85238489373,
				426.598190876
			],
			[
				.00084745939,
				0,
				0
			],
			[
				.00030863357,
				3.48441504555,
				220.4126424388
			],
			[
				.00034116062,
				.57297307557,
				206.1855484372
			],
			[
				.0001473407,
				2.11846596715,
				639.897286314
			],
			[
				9916667e-11,
				5.79003188904,
				419.4846438752
			],
			[
				6993564e-11,
				4.7360468972,
				7.1135470008
			],
			[
				4807588e-11,
				5.43305312061,
				316.3918696566
			]
		], [
			[
				.00198927992,
				4.93901017903,
				213.299095438
			],
			[
				.00036947916,
				3.14159265359,
				0
			],
			[
				.00017966989,
				.5197943111,
				426.598190876
			]
		]],
		[
			[
				[
					9.55758135486,
					0,
					0
				],
				[
					.52921382865,
					2.39226219573,
					213.299095438
				],
				[
					.01873679867,
					5.2354960466,
					206.1855484372
				],
				[
					.01464663929,
					1.64763042902,
					426.598190876
				],
				[
					.00821891141,
					5.93520042303,
					316.3918696566
				],
				[
					.00547506923,
					5.0153261898,
					103.0927742186
				],
				[
					.0037168465,
					2.27114821115,
					220.4126424388
				],
				[
					.00361778765,
					3.13904301847,
					7.1135470008
				],
				[
					.00140617506,
					5.70406606781,
					632.7837393132
				],
				[
					.00108974848,
					3.29313390175,
					110.2063212194
				],
				[
					.00069006962,
					5.94099540992,
					419.4846438752
				],
				[
					.00061053367,
					.94037691801,
					639.897286314
				],
				[
					.00048913294,
					1.55733638681,
					202.2533951741
				],
				[
					.00034143772,
					.19519102597,
					277.0349937414
				],
				[
					.00032401773,
					5.47084567016,
					949.1756089698
				],
				[
					.00020936596,
					.46349251129,
					735.8765135318
				],
				[
					9796004e-11,
					5.20477537945,
					1265.5674786264
				],
				[
					.00011993338,
					5.98050967385,
					846.0828347512
				],
				[
					208393e-9,
					1.52102476129,
					433.7117378768
				],
				[
					.00015298404,
					3.0594381494,
					529.6909650946
				],
				[
					6465823e-11,
					.17732249942,
					1052.2683831884
				],
				[
					.00011380257,
					1.7310542704,
					522.5774180938
				],
				[
					3419618e-11,
					4.94550542171,
					1581.959348283
				]
			],
			[
				[
					.0618298134,
					.2584351148,
					213.299095438
				],
				[
					.00506577242,
					.71114625261,
					206.1855484372
				],
				[
					.00341394029,
					5.79635741658,
					426.598190876
				],
				[
					.00188491195,
					.47215589652,
					220.4126424388
				],
				[
					.00186261486,
					3.14159265359,
					0
				],
				[
					.00143891146,
					1.40744822888,
					7.1135470008
				]
			],
			[[
				.00436902572,
				4.78671677509,
				213.299095438
			]]
		]
	],
	Uranus: [
		[[
			[
				5.48129294297,
				0,
				0
			],
			[
				.09260408234,
				.89106421507,
				74.7815985673
			],
			[
				.01504247898,
				3.6271926092,
				1.4844727083
			],
			[
				.00365981674,
				1.89962179044,
				73.297125859
			],
			[
				.00272328168,
				3.35823706307,
				149.5631971346
			],
			[
				.00070328461,
				5.39254450063,
				63.7358983034
			],
			[
				.00068892678,
				6.09292483287,
				76.2660712756
			],
			[
				.00061998615,
				2.26952066061,
				2.9689454166
			],
			[
				.00061950719,
				2.85098872691,
				11.0457002639
			],
			[
				.0002646877,
				3.14152083966,
				71.8126531507
			],
			[
				.00025710476,
				6.11379840493,
				454.9093665273
			],
			[
				.0002107885,
				4.36059339067,
				148.0787244263
			],
			[
				.00017818647,
				1.74436930289,
				36.6485629295
			],
			[
				.00014613507,
				4.73732166022,
				3.9321532631
			],
			[
				.00011162509,
				5.8268179635,
				224.3447957019
			],
			[
				.0001099791,
				.48865004018,
				138.5174968707
			],
			[
				9527478e-11,
				2.95516862826,
				35.1640902212
			],
			[
				7545601e-11,
				5.236265824,
				109.9456887885
			],
			[
				4220241e-11,
				3.23328220918,
				70.8494453042
			],
			[
				40519e-9,
				2.277550173,
				151.0476698429
			],
			[
				3354596e-11,
				1.0654900738,
				4.4534181249
			],
			[
				2926718e-11,
				4.62903718891,
				9.5612275556
			],
			[
				349034e-10,
				5.48306144511,
				146.594251718
			],
			[
				3144069e-11,
				4.75199570434,
				77.7505439839
			],
			[
				2922333e-11,
				5.35235361027,
				85.8272988312
			],
			[
				2272788e-11,
				4.36600400036,
				70.3281804424
			],
			[
				2051219e-11,
				1.51773566586,
				.1118745846
			],
			[
				2148602e-11,
				.60745949945,
				38.1330356378
			],
			[
				1991643e-11,
				4.92437588682,
				277.0349937414
			],
			[
				1376226e-11,
				2.04283539351,
				65.2203710117
			],
			[
				1666902e-11,
				3.62744066769,
				380.12776796
			],
			[
				1284107e-11,
				3.11347961505,
				202.2533951741
			],
			[
				1150429e-11,
				.93343589092,
				3.1813937377
			],
			[
				1533221e-11,
				2.58594681212,
				52.6901980395
			],
			[
				1281604e-11,
				.54271272721,
				222.8603229936
			],
			[
				1372139e-11,
				4.19641530878,
				111.4301614968
			],
			[
				1221029e-11,
				.1990065003,
				108.4612160802
			],
			[
				946181e-11,
				1.19253165736,
				127.4717966068
			],
			[
				1150989e-11,
				4.17898916639,
				33.6796175129
			]
		], [
			[
				74.7815986091,
				0,
				0
			],
			[
				.00154332863,
				5.24158770553,
				74.7815985673
			],
			[
				.00024456474,
				1.71260334156,
				1.4844727083
			],
			[
				9258442e-11,
				.4282973235,
				11.0457002639
			],
			[
				8265977e-11,
				1.50218091379,
				63.7358983034
			],
			[
				915016e-10,
				1.41213765216,
				149.5631971346
			]
		]],
		[[
			[
				.01346277648,
				2.61877810547,
				74.7815985673
			],
			[
				623414e-9,
				5.08111189648,
				149.5631971346
			],
			[
				.00061601196,
				3.14159265359,
				0
			],
			[
				9963722e-11,
				1.61603805646,
				76.2660712756
			],
			[
				992616e-10,
				.57630380333,
				73.297125859
			]
		], [[
			.00034101978,
			.01321929936,
			74.7815985673
		]]],
		[[
			[
				19.21264847206,
				0,
				0
			],
			[
				.88784984413,
				5.60377527014,
				74.7815985673
			],
			[
				.03440836062,
				.32836099706,
				73.297125859
			],
			[
				.0205565386,
				1.7829515933,
				149.5631971346
			],
			[
				.0064932241,
				4.52247285911,
				76.2660712756
			],
			[
				.00602247865,
				3.86003823674,
				63.7358983034
			],
			[
				.00496404167,
				1.40139935333,
				454.9093665273
			],
			[
				.00338525369,
				1.58002770318,
				138.5174968707
			],
			[
				.00243509114,
				1.57086606044,
				71.8126531507
			],
			[
				.00190522303,
				1.99809394714,
				1.4844727083
			],
			[
				.00161858838,
				2.79137786799,
				148.0787244263
			],
			[
				.00143706183,
				1.38368544947,
				11.0457002639
			],
			[
				.00093192405,
				.17437220467,
				36.6485629295
			],
			[
				.00071424548,
				4.24509236074,
				224.3447957019
			],
			[
				.00089806014,
				3.66105364565,
				109.9456887885
			],
			[
				.00039009723,
				1.66971401684,
				70.8494453042
			],
			[
				.00046677296,
				1.39976401694,
				35.1640902212
			],
			[
				.00039025624,
				3.36234773834,
				277.0349937414
			],
			[
				.00036755274,
				3.88649278513,
				146.594251718
			],
			[
				.00030348723,
				.70100838798,
				151.0476698429
			],
			[
				.00029156413,
				3.180563367,
				77.7505439839
			],
			[
				.00022637073,
				.72518687029,
				529.6909650946
			],
			[
				.00011959076,
				1.7504339214,
				984.6003316219
			],
			[
				.00025620756,
				5.25656086672,
				380.12776796
			]
		], [[
			.01479896629,
			3.67205697578,
			74.7815985673
		]]]
	],
	Neptune: [
		[[
			[
				5.31188633046,
				0,
				0
			],
			[
				.0179847553,
				2.9010127389,
				38.1330356378
			],
			[
				.01019727652,
				.48580922867,
				1.4844727083
			],
			[
				.00124531845,
				4.83008090676,
				36.6485629295
			],
			[
				.00042064466,
				5.41054993053,
				2.9689454166
			],
			[
				.00037714584,
				6.09221808686,
				35.1640902212
			],
			[
				.00033784738,
				1.24488874087,
				76.2660712756
			],
			[
				.00016482741,
				7727998e-11,
				491.5579294568
			],
			[
				9198584e-11,
				4.93747051954,
				39.6175083461
			],
			[
				899425e-10,
				.27462171806,
				175.1660598002
			]
		], [
			[
				38.13303563957,
				0,
				0
			],
			[
				.00016604172,
				4.86323329249,
				1.4844727083
			],
			[
				.00015744045,
				2.27887427527,
				38.1330356378
			]
		]],
		[[
			[
				.03088622933,
				1.44104372644,
				38.1330356378
			],
			[
				.00027780087,
				5.91271884599,
				76.2660712756
			],
			[
				.00027623609,
				0,
				0
			],
			[
				.00015355489,
				2.52123799551,
				36.6485629295
			],
			[
				.00015448133,
				3.50877079215,
				39.6175083461
			]
		]],
		[[
			[
				30.07013205828,
				0,
				0
			],
			[
				.27062259632,
				1.32999459377,
				38.1330356378
			],
			[
				.01691764014,
				3.25186135653,
				36.6485629295
			],
			[
				.00807830553,
				5.18592878704,
				1.4844727083
			],
			[
				.0053776051,
				4.52113935896,
				35.1640902212
			],
			[
				.00495725141,
				1.5710564165,
				491.5579294568
			],
			[
				.00274571975,
				1.84552258866,
				175.1660598002
			],
			[
				.0001201232,
				1.92059384991,
				1021.2488945514
			],
			[
				.00121801746,
				5.79754470298,
				76.2660712756
			],
			[
				.00100896068,
				.3770272493,
				73.297125859
			],
			[
				.00135134092,
				3.37220609835,
				39.6175083461
			],
			[
				7571796e-11,
				1.07149207335,
				388.4651552382
			]
		]]
	]
};
function DeltaT_EspenakMeeus(ut) {
	var u, u2, u3, u4, u5, u6, u7;
	const y = 2e3 + (ut - 14) / DAYS_PER_TROPICAL_YEAR;
	if (y < -500) {
		u = (y - 1820) / 100;
		return -20 + 32 * u * u;
	}
	if (y < 500) {
		u = y / 100;
		u2 = u * u;
		u3 = u * u2;
		u4 = u2 * u2;
		u5 = u2 * u3;
		u6 = u3 * u3;
		return 10583.6 - 1014.41 * u + 33.78311 * u2 - 5.952053 * u3 - .1798452 * u4 + .022174192 * u5 + .0090316521 * u6;
	}
	if (y < 1600) {
		u = (y - 1e3) / 100;
		u2 = u * u;
		u3 = u * u2;
		u4 = u2 * u2;
		u5 = u2 * u3;
		u6 = u3 * u3;
		return 1574.2 - 556.01 * u + 71.23472 * u2 + .319781 * u3 - .8503463 * u4 - .005050998 * u5 + .0083572073 * u6;
	}
	if (y < 1700) {
		u = y - 1600;
		u2 = u * u;
		u3 = u * u2;
		return 120 - .9808 * u - .01532 * u2 + u3 / 7129;
	}
	if (y < 1800) {
		u = y - 1700;
		u2 = u * u;
		u3 = u * u2;
		u4 = u2 * u2;
		return 8.83 + .1603 * u - .0059285 * u2 + 13336e-8 * u3 - u4 / 1174e3;
	}
	if (y < 1860) {
		u = y - 1800;
		u2 = u * u;
		u3 = u * u2;
		u4 = u2 * u2;
		u5 = u2 * u3;
		u6 = u3 * u3;
		u7 = u3 * u4;
		return 13.72 - .332447 * u + .0068612 * u2 + .0041116 * u3 - 37436e-8 * u4 + 121272e-10 * u5 - 1.699e-7 * u6 + 875e-12 * u7;
	}
	if (y < 1900) {
		u = y - 1860;
		u2 = u * u;
		u3 = u * u2;
		u4 = u2 * u2;
		u5 = u2 * u3;
		return 7.62 + .5737 * u - .251754 * u2 + .01680668 * u3 - .0004473624 * u4 + u5 / 233174;
	}
	if (y < 1920) {
		u = y - 1900;
		u2 = u * u;
		u3 = u * u2;
		u4 = u2 * u2;
		return -2.79 + 1.494119 * u - .0598939 * u2 + .0061966 * u3 - 197e-6 * u4;
	}
	if (y < 1941) {
		u = y - 1920;
		u2 = u * u;
		u3 = u * u2;
		return 21.2 + .84493 * u - .0761 * u2 + .0020936 * u3;
	}
	if (y < 1961) {
		u = y - 1950;
		u2 = u * u;
		u3 = u * u2;
		return 29.07 + .407 * u - u2 / 233 + u3 / 2547;
	}
	if (y < 1986) {
		u = y - 1975;
		u2 = u * u;
		u3 = u * u2;
		return 45.45 + 1.067 * u - u2 / 260 - u3 / 718;
	}
	if (y < 2005) {
		u = y - 2e3;
		u2 = u * u;
		u3 = u * u2;
		u4 = u2 * u2;
		u5 = u2 * u3;
		return 63.86 + .3345 * u - .060374 * u2 + .0017275 * u3 + 651814e-9 * u4 + 2373599e-11 * u5;
	}
	if (y < 2050) {
		u = y - 2e3;
		return 62.92 + .32217 * u + .005589 * u * u;
	}
	if (y < 2150) {
		u = (y - 1820) / 100;
		return -20 + 32 * u * u - .5628 * (2150 - y);
	}
	u = (y - 1820) / 100;
	return -20 + 32 * u * u;
}
var DeltaT = DeltaT_EspenakMeeus;
/**
* @ignore
*
* @brief Calculates Terrestrial Time (TT) from Universal Time (UT).
*
* @param {number} ut
*      The Universal Time expressed as a floating point number of days since the 2000.0 epoch.
*
* @returns {number}
*      A Terrestrial Time expressed as a floating point number of days since the 2000.0 epoch.
*/
function TerrestrialTime(ut) {
	return ut + DeltaT(ut) / 86400;
}
/**
* @brief The date and time of an astronomical observation.
*
* Objects of type `AstroTime` are used throughout the internals
* of the Astronomy library, and are included in certain return objects.
* Use the constructor or the {@link MakeTime} function to create an `AstroTime` object.
*
* @property {Date} date
*      The JavaScript Date object for the given date and time.
*      This Date corresponds to the numeric day value stored in the `ut` property.
*
* @property {number} ut
*      Universal Time (UT1/UTC) in fractional days since the J2000 epoch.
*      Universal Time represents time measured with respect to the Earth's rotation,
*      tracking mean solar days.
*      The Astronomy library approximates UT1 and UTC as being the same thing.
*      This gives sufficient accuracy for the precision requirements of this project.
*
* @property {number} tt
*      Terrestrial Time in fractional days since the J2000 epoch.
*      TT represents a continuously flowing ephemeris timescale independent of
*      any variations of the Earth's rotation, and is adjusted from UT
*      using a best-fit piecewise polynomial model devised by
*      [Espenak and Meeus](https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html).
*/
var AstroTime = class AstroTime {
	/**
	* @param {FlexibleDateTime} date
	*      A JavaScript Date object, a numeric UTC value expressed in J2000 days, or another AstroTime object.
	*/
	constructor(date) {
		if (date instanceof AstroTime) {
			this.date = date.date;
			this.ut = date.ut;
			this.tt = date.tt;
			return;
		}
		const MillisPerDay = 864e5;
		if (date instanceof Date && Number.isFinite(date.getTime())) {
			this.date = date;
			this.ut = (date.getTime() - J2000.getTime()) / MillisPerDay;
			this.tt = TerrestrialTime(this.ut);
			return;
		}
		if (Number.isFinite(date)) {
			this.date = new Date(J2000.getTime() + date * MillisPerDay);
			this.ut = date;
			this.tt = TerrestrialTime(this.ut);
			return;
		}
		throw "Argument must be a Date object, an AstroTime object, or a numeric UTC Julian date.";
	}
	/**
	* @brief Creates an `AstroTime` value from a Terrestrial Time (TT) day value.
	*
	* This function can be used in rare cases where a time must be based
	* on Terrestrial Time (TT) rather than Universal Time (UT).
	* Most developers will want to invoke `new AstroTime(ut)` with a universal time
	* instead of this function, because usually time is based on civil time adjusted
	* by leap seconds to match the Earth's rotation, rather than the uniformly
	* flowing TT used to calculate solar system dynamics. In rare cases
	* where the caller already knows TT, this function is provided to create
	* an `AstroTime` value that can be passed to Astronomy Engine functions.
	*
	* @param {number} tt
	*      The number of days since the J2000 epoch as expressed in Terrestrial Time.
	*
	* @returns {AstroTime}
	*      An `AstroTime` object for the specified terrestrial time.
	*/
	static FromTerrestrialTime(tt) {
		let time = new AstroTime(tt);
		for (;;) {
			const err = tt - time.tt;
			if (Math.abs(err) < 1e-12) return time;
			time = time.AddDays(err);
		}
	}
	/**
	* Formats an `AstroTime` object as an [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)
	* date/time string in UTC, to millisecond resolution.
	* Example: `2018-08-17T17:22:04.050Z`
	* @returns {string}
	*/
	toString() {
		return this.date.toISOString();
	}
	/**
	* Returns a new `AstroTime` object adjusted by the floating point number of days.
	* Does NOT modify the original `AstroTime` object.
	*
	* @param {number} days
	*      The floating point number of days by which to adjust the given date and time.
	*      Positive values adjust the date toward the future, and
	*      negative values adjust the date toward the past.
	*
	* @returns {AstroTime}
	*/
	AddDays(days) {
		return new AstroTime(this.ut + days);
	}
};
function InterpolateTime(time1, time2, fraction) {
	return new AstroTime(time1.ut + fraction * (time2.ut - time1.ut));
}
/**
* @brief A `Date`, `number`, or `AstroTime` value that specifies the date and time of an astronomical event.
*
* `FlexibleDateTime` is a placeholder type that represents three different types
* that may be passed to many Astronomy Engine functions: a JavaScript `Date` object,
* a number representing the real-valued number of UT days since the J2000 epoch,
* or an {@link AstroTime} object.
*
* This flexibility is for convenience of outside callers.
* Internally, Astronomy Engine always converts a `FlexibleDateTime` parameter
* to an `AstroTime` object by calling {@link MakeTime}.
*
* @typedef {Date | number | AstroTime} FlexibleDateTime
*/
/**
* @brief Converts multiple date/time formats to `AstroTime` format.
*
* Given a Date object or a number days since noon (12:00) on January 1, 2000 (UTC),
* this function creates an {@link AstroTime} object.
*
* Given an {@link AstroTime} object, returns the same object unmodified.
* Use of this function is not required for any of the other exposed functions in this library,
* because they all guarantee converting date/time parameters to `AstroTime`
* as needed. However, it may be convenient for callers who need to understand
* the difference between UTC and TT (Terrestrial Time). In some use cases,
* converting once to `AstroTime` format and passing the result into multiple
* function calls may be more efficient than passing in native JavaScript Date objects.
*
* @param {FlexibleDateTime} date
*      A Date object, a number of UTC days since the J2000 epoch (noon on January 1, 2000),
*      or an AstroTime object. See remarks above.
*
* @returns {AstroTime}
*/
function MakeTime(date) {
	if (date instanceof AstroTime) return date;
	return new AstroTime(date);
}
function iau2000b(time) {
	function mod(x) {
		return x % ASEC360 * ASEC2RAD;
	}
	const t = time.tt / 36525;
	const elp = mod(1287104.79305 + t * 129596581.0481);
	const f = mod(335779.526232 + t * 1739527262.8478);
	const d = mod(1072260.70369 + t * 1602961601.209);
	const om = mod(450160.398036 - t * 6962890.5431);
	let sarg = Math.sin(om);
	let carg = Math.cos(om);
	let dp = (-172064161 - 174666 * t) * sarg + 33386 * carg;
	let de = (92052331 + 9086 * t) * carg + 15377 * sarg;
	let arg = 2 * (f - d + om);
	sarg = Math.sin(arg);
	carg = Math.cos(arg);
	dp += (-13170906 - 1675 * t) * sarg - 13696 * carg;
	de += (5730336 - 3015 * t) * carg - 4587 * sarg;
	arg = 2 * (f + om);
	sarg = Math.sin(arg);
	carg = Math.cos(arg);
	dp += (-2276413 - 234 * t) * sarg + 2796 * carg;
	de += (978459 - 485 * t) * carg + 1374 * sarg;
	arg = 2 * om;
	sarg = Math.sin(arg);
	carg = Math.cos(arg);
	dp += (2074554 + 207 * t) * sarg - 698 * carg;
	de += (-897492 + 470 * t) * carg - 291 * sarg;
	sarg = Math.sin(elp);
	carg = Math.cos(elp);
	dp += (1475877 - 3633 * t) * sarg + 11817 * carg;
	de += (73871 - 184 * t) * carg - 1924 * sarg;
	return {
		dpsi: -135e-6 + dp * 1e-7,
		deps: 388e-6 + de * 1e-7
	};
}
function mean_obliq(time) {
	var t = time.tt / 36525;
	return (((((-4.34e-8 * t - 576e-9) * t + .0020034) * t - 1831e-7) * t - 46.836769) * t + 84381.406) / 3600;
}
var cache_e_tilt;
function e_tilt(time) {
	if (!cache_e_tilt || Math.abs(cache_e_tilt.tt - time.tt) > 1e-6) {
		const nut = iau2000b(time);
		const mean_ob = mean_obliq(time);
		const true_ob = mean_ob + nut.deps / 3600;
		cache_e_tilt = {
			tt: time.tt,
			dpsi: nut.dpsi,
			deps: nut.deps,
			ee: nut.dpsi * Math.cos(mean_ob * DEG2RAD) / 15,
			mobl: mean_ob,
			tobl: true_ob
		};
	}
	return cache_e_tilt;
}
function obl_ecl2equ_vec(oblDegrees, pos) {
	const obl = oblDegrees * DEG2RAD;
	const cos_obl = Math.cos(obl);
	const sin_obl = Math.sin(obl);
	return [
		pos[0],
		pos[1] * cos_obl - pos[2] * sin_obl,
		pos[1] * sin_obl + pos[2] * cos_obl
	];
}
function ecl2equ_vec(time, pos) {
	return obl_ecl2equ_vec(mean_obliq(time), pos);
}
var CalcMoonCount = 0;
function CalcMoon(time) {
	++CalcMoonCount;
	const T = time.tt / 36525;
	function DeclareArray1(xmin, xmax) {
		const array = [];
		let i = 0;
		for (; i <= xmax - xmin; ++i) array.push(0);
		return {
			min: xmin,
			array
		};
	}
	function DeclareArray2(xmin, xmax, ymin, ymax) {
		const array = [];
		for (let i = 0; i <= xmax - xmin; ++i) array.push(DeclareArray1(ymin, ymax));
		return {
			min: xmin,
			array
		};
	}
	function ArrayGet2(a, x, y) {
		const m = a.array[x - a.min];
		return m.array[y - m.min];
	}
	function ArraySet2(a, x, y, v) {
		const m = a.array[x - a.min];
		m.array[y - m.min] = v;
	}
	let S, MAX, ARG, FAC, I, J, T2, DGAM, DLAM, N, GAM1C, SINPI, L0, L, LS, F, D, DL0, DL, DLS, DF, DD, DS;
	let coArray = DeclareArray2(-6, 6, 1, 4);
	let siArray = DeclareArray2(-6, 6, 1, 4);
	function CO(x, y) {
		return ArrayGet2(coArray, x, y);
	}
	function SI(x, y) {
		return ArrayGet2(siArray, x, y);
	}
	function SetCO(x, y, v) {
		return ArraySet2(coArray, x, y, v);
	}
	function SetSI(x, y, v) {
		return ArraySet2(siArray, x, y, v);
	}
	function AddThe(c1, s1, c2, s2, func) {
		func(c1 * c2 - s1 * s2, s1 * c2 + c1 * s2);
	}
	function Sine(phi) {
		return Math.sin(PI2 * phi);
	}
	T2 = T * T;
	DLAM = 0;
	DS = 0;
	GAM1C = 0;
	SINPI = 3422.7;
	var S1 = Sine(.19833 + .05611 * T);
	var S2 = Sine(.27869 + .04508 * T);
	var S3 = Sine(.16827 - .36903 * T);
	var S4 = Sine(.34734 - 5.37261 * T);
	var S5 = Sine(.10498 - 5.37899 * T);
	var S6 = Sine(.42681 - .41855 * T);
	var S7 = Sine(.14943 - 5.37511 * T);
	DL0 = .84 * S1 + .31 * S2 + 14.27 * S3 + 7.26 * S4 + .28 * S5 + .24 * S6;
	DL = 2.94 * S1 + .31 * S2 + 14.27 * S3 + 9.34 * S4 + 1.12 * S5 + .83 * S6;
	DLS = -6.4 * S1 - 1.89 * S6;
	DF = .21 * S1 + .31 * S2 + 14.27 * S3 - 88.7 * S4 - 15.3 * S5 + .24 * S6 - 1.86 * S7;
	DD = DL0 - DLS;
	DGAM = -3332e-9 * Sine(.59734 - 5.37261 * T) - 539e-9 * Sine(.35498 - 5.37899 * T) - 64e-9 * Sine(.39943 - 5.37511 * T);
	L0 = PI2 * Frac(.60643382 + 1336.85522467 * T - 313e-8 * T2) + DL0 / ARC;
	L = PI2 * Frac(.37489701 + 1325.55240982 * T + 2565e-8 * T2) + DL / ARC;
	LS = PI2 * Frac(.99312619 + 99.99735956 * T - 44e-8 * T2) + DLS / ARC;
	F = PI2 * Frac(.25909118 + 1342.2278298 * T - 892e-8 * T2) + DF / ARC;
	D = PI2 * Frac(.82736186 + 1236.85308708 * T - 397e-8 * T2) + DD / ARC;
	for (I = 1; I <= 4; ++I) {
		switch (I) {
			case 1:
				ARG = L;
				MAX = 4;
				FAC = 1.000002208;
				break;
			case 2:
				ARG = LS;
				MAX = 3;
				FAC = .997504612 - .002495388 * T;
				break;
			case 3:
				ARG = F;
				MAX = 4;
				FAC = 1.000002708 + 139.978 * DGAM;
				break;
			case 4:
				ARG = D;
				MAX = 6;
				FAC = 1;
				break;
			default: throw `Internal error: I = ${I}`;
		}
		SetCO(0, I, 1);
		SetCO(1, I, Math.cos(ARG) * FAC);
		SetSI(0, I, 0);
		SetSI(1, I, Math.sin(ARG) * FAC);
		for (J = 2; J <= MAX; ++J) AddThe(CO(J - 1, I), SI(J - 1, I), CO(1, I), SI(1, I), (c, s) => (SetCO(J, I, c), SetSI(J, I, s)));
		for (J = 1; J <= MAX; ++J) {
			SetCO(-J, I, CO(J, I));
			SetSI(-J, I, -SI(J, I));
		}
	}
	function Term(p, q, r, s) {
		var result = {
			x: 1,
			y: 0
		};
		var I = [
			0,
			p,
			q,
			r,
			s
		];
		for (var k = 1; k <= 4; ++k) if (I[k] !== 0) AddThe(result.x, result.y, CO(I[k], k), SI(I[k], k), (c, s) => (result.x = c, result.y = s));
		return result;
	}
	function AddSol(coeffl, coeffs, coeffg, coeffp, p, q, r, s) {
		var result = Term(p, q, r, s);
		DLAM += coeffl * result.y;
		DS += coeffs * result.y;
		GAM1C += coeffg * result.x;
		SINPI += coeffp * result.x;
	}
	AddSol(13.902, 14.06, -.001, .2607, 0, 0, 0, 4);
	AddSol(.403, -4.01, .394, .0023, 0, 0, 0, 3);
	AddSol(2369.912, 2373.36, .601, 28.2333, 0, 0, 0, 2);
	AddSol(-125.154, -112.79, -.725, -.9781, 0, 0, 0, 1);
	AddSol(1.979, 6.98, -.445, .0433, 1, 0, 0, 4);
	AddSol(191.953, 192.72, .029, 3.0861, 1, 0, 0, 2);
	AddSol(-8.466, -13.51, .455, -.1093, 1, 0, 0, 1);
	AddSol(22639.5, 22609.07, .079, 186.5398, 1, 0, 0, 0);
	AddSol(18.609, 3.59, -.094, .0118, 1, 0, 0, -1);
	AddSol(-4586.465, -4578.13, -.077, 34.3117, 1, 0, 0, -2);
	AddSol(3.215, 5.44, .192, -.0386, 1, 0, 0, -3);
	AddSol(-38.428, -38.64, .001, .6008, 1, 0, 0, -4);
	AddSol(-.393, -1.43, -.092, .0086, 1, 0, 0, -6);
	AddSol(-.289, -1.59, .123, -.0053, 0, 1, 0, 4);
	AddSol(-24.42, -25.1, .04, -.3, 0, 1, 0, 2);
	AddSol(18.023, 17.93, .007, .1494, 0, 1, 0, 1);
	AddSol(-668.146, -126.98, -1.302, -.3997, 0, 1, 0, 0);
	AddSol(.56, .32, -.001, -.0037, 0, 1, 0, -1);
	AddSol(-165.145, -165.06, .054, 1.9178, 0, 1, 0, -2);
	AddSol(-1.877, -6.46, -.416, .0339, 0, 1, 0, -4);
	AddSol(.213, 1.02, -.074, .0054, 2, 0, 0, 4);
	AddSol(14.387, 14.78, -.017, .2833, 2, 0, 0, 2);
	AddSol(-.586, -1.2, .054, -.01, 2, 0, 0, 1);
	AddSol(769.016, 767.96, .107, 10.1657, 2, 0, 0, 0);
	AddSol(1.75, 2.01, -.018, .0155, 2, 0, 0, -1);
	AddSol(-211.656, -152.53, 5.679, -.3039, 2, 0, 0, -2);
	AddSol(1.225, .91, -.03, -.0088, 2, 0, 0, -3);
	AddSol(-30.773, -34.07, -.308, .3722, 2, 0, 0, -4);
	AddSol(-.57, -1.4, -.074, .0109, 2, 0, 0, -6);
	AddSol(-2.921, -11.75, .787, -.0484, 1, 1, 0, 2);
	AddSol(1.267, 1.52, -.022, .0164, 1, 1, 0, 1);
	AddSol(-109.673, -115.18, .461, -.949, 1, 1, 0, 0);
	AddSol(-205.962, -182.36, 2.056, 1.4437, 1, 1, 0, -2);
	AddSol(.233, .36, .012, -.0025, 1, 1, 0, -3);
	AddSol(-4.391, -9.66, -.471, .0673, 1, 1, 0, -4);
	AddSol(.283, 1.53, -.111, .006, 1, -1, 0, 4);
	AddSol(14.577, 31.7, -1.54, .2302, 1, -1, 0, 2);
	AddSol(147.687, 138.76, .679, 1.1528, 1, -1, 0, 0);
	AddSol(-1.089, .55, .021, 0, 1, -1, 0, -1);
	AddSol(28.475, 23.59, -.443, -.2257, 1, -1, 0, -2);
	AddSol(-.276, -.38, -.006, -.0036, 1, -1, 0, -3);
	AddSol(.636, 2.27, .146, -.0102, 1, -1, 0, -4);
	AddSol(-.189, -1.68, .131, -.0028, 0, 2, 0, 2);
	AddSol(-7.486, -.66, -.037, -.0086, 0, 2, 0, 0);
	AddSol(-8.096, -16.35, -.74, .0918, 0, 2, 0, -2);
	AddSol(-5.741, -.04, 0, -9e-4, 0, 0, 2, 2);
	AddSol(.255, 0, 0, 0, 0, 0, 2, 1);
	AddSol(-411.608, -.2, 0, -.0124, 0, 0, 2, 0);
	AddSol(.584, .84, 0, .0071, 0, 0, 2, -1);
	AddSol(-55.173, -52.14, 0, -.1052, 0, 0, 2, -2);
	AddSol(.254, .25, 0, -.0017, 0, 0, 2, -3);
	AddSol(.025, -1.67, 0, .0031, 0, 0, 2, -4);
	AddSol(1.06, 2.96, -.166, .0243, 3, 0, 0, 2);
	AddSol(36.124, 50.64, -1.3, .6215, 3, 0, 0, 0);
	AddSol(-13.193, -16.4, .258, -.1187, 3, 0, 0, -2);
	AddSol(-1.187, -.74, .042, .0074, 3, 0, 0, -4);
	AddSol(-.293, -.31, -.002, .0046, 3, 0, 0, -6);
	AddSol(-.29, -1.45, .116, -.0051, 2, 1, 0, 2);
	AddSol(-7.649, -10.56, .259, -.1038, 2, 1, 0, 0);
	AddSol(-8.627, -7.59, .078, -.0192, 2, 1, 0, -2);
	AddSol(-2.74, -2.54, .022, .0324, 2, 1, 0, -4);
	AddSol(1.181, 3.32, -.212, .0213, 2, -1, 0, 2);
	AddSol(9.703, 11.67, -.151, .1268, 2, -1, 0, 0);
	AddSol(-.352, -.37, .001, -.0028, 2, -1, 0, -1);
	AddSol(-2.494, -1.17, -.003, -.0017, 2, -1, 0, -2);
	AddSol(.36, .2, -.012, -.0043, 2, -1, 0, -4);
	AddSol(-1.167, -1.25, .008, -.0106, 1, 2, 0, 0);
	AddSol(-7.412, -6.12, .117, .0484, 1, 2, 0, -2);
	AddSol(-.311, -.65, -.032, .0044, 1, 2, 0, -4);
	AddSol(.757, 1.82, -.105, .0112, 1, -2, 0, 2);
	AddSol(2.58, 2.32, .027, .0196, 1, -2, 0, 0);
	AddSol(2.533, 2.4, -.014, -.0212, 1, -2, 0, -2);
	AddSol(-.344, -.57, -.025, .0036, 0, 3, 0, -2);
	AddSol(-.992, -.02, 0, 0, 1, 0, 2, 2);
	AddSol(-45.099, -.02, 0, -.001, 1, 0, 2, 0);
	AddSol(-.179, -9.52, 0, -.0833, 1, 0, 2, -2);
	AddSol(-.301, -.33, 0, .0014, 1, 0, 2, -4);
	AddSol(-6.382, -3.37, 0, -.0481, 1, 0, -2, 2);
	AddSol(39.528, 85.13, 0, -.7136, 1, 0, -2, 0);
	AddSol(9.366, .71, 0, -.0112, 1, 0, -2, -2);
	AddSol(.202, .02, 0, 0, 1, 0, -2, -4);
	AddSol(.415, .1, 0, .0013, 0, 1, 2, 0);
	AddSol(-2.152, -2.26, 0, -.0066, 0, 1, 2, -2);
	AddSol(-1.44, -1.3, 0, .0014, 0, 1, -2, 2);
	AddSol(.384, -.04, 0, 0, 0, 1, -2, -2);
	AddSol(1.938, 3.6, -.145, .0401, 4, 0, 0, 0);
	AddSol(-.952, -1.58, .052, -.013, 4, 0, 0, -2);
	AddSol(-.551, -.94, .032, -.0097, 3, 1, 0, 0);
	AddSol(-.482, -.57, .005, -.0045, 3, 1, 0, -2);
	AddSol(.681, .96, -.026, .0115, 3, -1, 0, 0);
	AddSol(-.297, -.27, .002, -9e-4, 2, 2, 0, -2);
	AddSol(.254, .21, -.003, 0, 2, -2, 0, -2);
	AddSol(-.25, -.22, .004, .0014, 1, 3, 0, -2);
	AddSol(-3.996, 0, 0, 4e-4, 2, 0, 2, 0);
	AddSol(.557, -.75, 0, -.009, 2, 0, 2, -2);
	AddSol(-.459, -.38, 0, -.0053, 2, 0, -2, 2);
	AddSol(-1.298, .74, 0, 4e-4, 2, 0, -2, 0);
	AddSol(.538, 1.14, 0, -.0141, 2, 0, -2, -2);
	AddSol(.263, .02, 0, 0, 1, 1, 2, 0);
	AddSol(.426, .07, 0, -6e-4, 1, 1, -2, -2);
	AddSol(-.304, .03, 0, 3e-4, 1, -1, 2, 0);
	AddSol(-.372, -.19, 0, -.0027, 1, -1, -2, 2);
	AddSol(.418, 0, 0, 0, 0, 0, 4, 0);
	AddSol(-.33, -.04, 0, 0, 3, 0, 2, 0);
	function ADDN(coeffn, p, q, r, s) {
		return coeffn * Term(p, q, r, s).y;
	}
	N = 0;
	N += ADDN(-526.069, 0, 0, 1, -2);
	N += ADDN(-3.352, 0, 0, 1, -4);
	N += ADDN(44.297, 1, 0, 1, -2);
	N += ADDN(-6, 1, 0, 1, -4);
	N += ADDN(20.599, -1, 0, 1, 0);
	N += ADDN(-30.598, -1, 0, 1, -2);
	N += ADDN(-24.649, -2, 0, 1, 0);
	N += ADDN(-2, -2, 0, 1, -2);
	N += ADDN(-22.571, 0, 1, 1, -2);
	N += ADDN(10.985, 0, -1, 1, -2);
	DLAM += .82 * Sine(.7736 - 62.5512 * T) + .31 * Sine(.0466 - 125.1025 * T) + .35 * Sine(.5785 - 25.1042 * T) + .66 * Sine(.4591 + 1335.8075 * T) + .64 * Sine(.313 - 91.568 * T) + 1.14 * Sine(.148 + 1331.2898 * T) + .21 * Sine(.5918 + 1056.5859 * T) + .44 * Sine(.5784 + 1322.8595 * T) + .24 * Sine(.2275 - 5.7374 * T) + .28 * Sine(.2965 + 2.6929 * T) + .33 * Sine(.3132 + 6.3368 * T);
	S = F + DS / ARC;
	let lat_seconds = (1.000002708 + 139.978 * DGAM) * (18518.511 + 1.189 + GAM1C) * Math.sin(S) - 6.24 * Math.sin(3 * S) + N;
	return {
		geo_eclip_lon: PI2 * Frac((L0 + DLAM / ARC) / PI2),
		geo_eclip_lat: Math.PI / 648e3 * lat_seconds,
		distance_au: ARC * EARTH_EQUATORIAL_RADIUS_AU / (.999953253 * SINPI)
	};
}
function rotate(rot, vec) {
	return [
		rot.rot[0][0] * vec[0] + rot.rot[1][0] * vec[1] + rot.rot[2][0] * vec[2],
		rot.rot[0][1] * vec[0] + rot.rot[1][1] * vec[1] + rot.rot[2][1] * vec[2],
		rot.rot[0][2] * vec[0] + rot.rot[1][2] * vec[1] + rot.rot[2][2] * vec[2]
	];
}
function precession(pos, time, dir) {
	return rotate(precession_rot(time, dir), pos);
}
function precession_rot(time, dir) {
	const t = time.tt / 36525;
	let eps0 = 84381.406;
	let psia = ((((-9.51e-8 * t + 132851e-9) * t - .00114045) * t - 1.0790069) * t + 5038.481507) * t;
	let omegaa = ((((3.337e-7 * t - 467e-9) * t - .00772503) * t + .0512623) * t - .025754) * t + eps0;
	let chia = ((((-56e-9 * t + 170663e-9) * t - .00121197) * t - 2.3814292) * t + 10.556403) * t;
	eps0 *= ASEC2RAD;
	psia *= ASEC2RAD;
	omegaa *= ASEC2RAD;
	chia *= ASEC2RAD;
	const sa = Math.sin(eps0);
	const ca = Math.cos(eps0);
	const sb = Math.sin(-psia);
	const cb = Math.cos(-psia);
	const sc = Math.sin(-omegaa);
	const cc = Math.cos(-omegaa);
	const sd = Math.sin(chia);
	const cd = Math.cos(chia);
	const xx = cd * cb - sb * sd * cc;
	const yx = cd * sb * ca + sd * cc * cb * ca - sa * sd * sc;
	const zx = cd * sb * sa + sd * cc * cb * sa + ca * sd * sc;
	const xy = -sd * cb - sb * cd * cc;
	const yy = -sd * sb * ca + cd * cc * cb * ca - sa * cd * sc;
	const zy = -sd * sb * sa + cd * cc * cb * sa + ca * cd * sc;
	const xz = sb * sc;
	const yz = -sc * cb * ca - sa * cc;
	const zz = -sc * cb * sa + cc * ca;
	if (dir === PrecessDirection.Into2000) return new RotationMatrix([
		[
			xx,
			yx,
			zx
		],
		[
			xy,
			yy,
			zy
		],
		[
			xz,
			yz,
			zz
		]
	]);
	if (dir === PrecessDirection.From2000) return new RotationMatrix([
		[
			xx,
			xy,
			xz
		],
		[
			yx,
			yy,
			yz
		],
		[
			zx,
			zy,
			zz
		]
	]);
	throw "Invalid precess direction";
}
function era(time) {
	let theta = 360 * ((.779057273264 + .00273781191135448 * time.ut + time.ut % 1) % 1);
	if (theta < 0) theta += 360;
	return theta;
}
var sidereal_time_cache;
function sidereal_time(time) {
	if (!sidereal_time_cache || sidereal_time_cache.tt !== time.tt) {
		const t = time.tt / 36525;
		let eqeq = 15 * e_tilt(time).ee;
		const theta = era(time);
		let gst = ((eqeq + .014506 + ((((-3.68e-8 * t - 29956e-9) * t - 44e-8) * t + 1.3915817) * t + 4612.156534) * t) / 3600 + theta) % 360 / 15;
		if (gst < 0) gst += 24;
		sidereal_time_cache = {
			tt: time.tt,
			st: gst
		};
	}
	return sidereal_time_cache.st;
}
function terra(observer, st) {
	const phi = observer.latitude * DEG2RAD;
	const sinphi = Math.sin(phi);
	const cosphi = Math.cos(phi);
	const c = 1 / Math.hypot(cosphi, EARTH_FLATTENING * sinphi);
	const s = EARTH_FLATTENING_SQUARED * c;
	const ht_km = observer.height / 1e3;
	const ach = EARTH_EQUATORIAL_RADIUS_KM * c + ht_km;
	const ash = EARTH_EQUATORIAL_RADIUS_KM * s + ht_km;
	const stlocl = (15 * st + observer.longitude) * DEG2RAD;
	const sinst = Math.sin(stlocl);
	const cosst = Math.cos(stlocl);
	return {
		pos: [
			ach * cosphi * cosst / KM_PER_AU,
			ach * cosphi * sinst / KM_PER_AU,
			ash * sinphi / KM_PER_AU
		],
		vel: [
			-7292115e-11 * ach * cosphi * sinst * 86400 / KM_PER_AU,
			ANGVEL * ach * cosphi * cosst * 86400 / KM_PER_AU,
			0
		]
	};
}
function nutation(pos, time, dir) {
	return rotate(nutation_rot(time, dir), pos);
}
function nutation_rot(time, dir) {
	const tilt = e_tilt(time);
	const oblm = tilt.mobl * DEG2RAD;
	const oblt = tilt.tobl * DEG2RAD;
	const psi = tilt.dpsi * ASEC2RAD;
	const cobm = Math.cos(oblm);
	const sobm = Math.sin(oblm);
	const cobt = Math.cos(oblt);
	const sobt = Math.sin(oblt);
	const cpsi = Math.cos(psi);
	const spsi = Math.sin(psi);
	const xx = cpsi;
	const yx = -spsi * cobm;
	const zx = -spsi * sobm;
	const xy = spsi * cobt;
	const yy = cpsi * cobm * cobt + sobm * sobt;
	const zy = cpsi * sobm * cobt - cobm * sobt;
	const xz = spsi * sobt;
	const yz = cpsi * cobm * sobt - sobm * cobt;
	const zz = cpsi * sobm * sobt + cobm * cobt;
	if (dir === PrecessDirection.From2000) return new RotationMatrix([
		[
			xx,
			xy,
			xz
		],
		[
			yx,
			yy,
			yz
		],
		[
			zx,
			zy,
			zz
		]
	]);
	if (dir === PrecessDirection.Into2000) return new RotationMatrix([
		[
			xx,
			yx,
			zx
		],
		[
			xy,
			yy,
			zy
		],
		[
			xz,
			yz,
			zz
		]
	]);
	throw "Invalid precess direction";
}
function gyration(pos, time, dir) {
	return dir === PrecessDirection.Into2000 ? precession(nutation(pos, time, dir), time, dir) : nutation(precession(pos, time, dir), time, dir);
}
function geo_pos(time, observer) {
	const pos = terra(observer, sidereal_time(time)).pos;
	return gyration(pos, time, PrecessDirection.Into2000);
}
/**
* @brief A 3D Cartesian vector with a time attached to it.
*
* Holds the Cartesian coordinates of a vector in 3D space,
* along with the time at which the vector is valid.
*
* @property {number} x        The x-coordinate expressed in astronomical units (AU).
* @property {number} y        The y-coordinate expressed in astronomical units (AU).
* @property {number} z        The z-coordinate expressed in astronomical units (AU).
* @property {AstroTime} t     The time at which the vector is valid.
*/
var Vector = class {
	constructor(x, y, z, t) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.t = t;
	}
	/**
	* Returns the length of the vector in astronomical units (AU).
	* @returns {number}
	*/
	Length() {
		return Math.hypot(this.x, this.y, this.z);
	}
};
/**
* @brief A combination of a position vector, a velocity vector, and a time.
*
* Holds the state vector of a body at a given time, including its position,
* velocity, and the time they are valid.
*
* @property {number} x        The position x-coordinate expressed in astronomical units (AU).
* @property {number} y        The position y-coordinate expressed in astronomical units (AU).
* @property {number} z        The position z-coordinate expressed in astronomical units (AU).
* @property {number} vx       The velocity x-coordinate expressed in AU/day.
* @property {number} vy       The velocity y-coordinate expressed in AU/day.
* @property {number} vz       The velocity z-coordinate expressed in AU/day.
* @property {AstroTime} t     The time at which the vector is valid.
*/
var StateVector = class {
	constructor(x, y, z, vx, vy, vz, t) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.vx = vx;
		this.vy = vy;
		this.vz = vz;
		this.t = t;
	}
};
/**
* @brief Holds spherical coordinates: latitude, longitude, distance.
*
* Spherical coordinates represent the location of
* a point using two angles and a distance.
*
* @property {number} lat       The latitude angle: -90..+90 degrees.
* @property {number} lon       The longitude angle: 0..360 degrees.
* @property {number} dist      Distance in AU.
*/
var Spherical = class {
	constructor(lat, lon, dist) {
		this.lat = VerifyNumber(lat);
		this.lon = VerifyNumber(lon);
		this.dist = VerifyNumber(dist);
	}
};
/**
* @brief Holds right ascension, declination, and distance of a celestial object.
*
* @property {number} ra
*      Right ascension in sidereal hours: [0, 24).
*
* @property {number} dec
*      Declination in degrees: [-90, +90].
*
* @property {number} dist
*      Distance to the celestial object expressed in
*      <a href="https://en.wikipedia.org/wiki/Astronomical_unit">astronomical units</a> (AU).
*
* @property {Vector} vec
*      The equatorial coordinates in cartesian form, using AU distance units.
*      x = direction of the March equinox,
*      y = direction of the June solstice,
*      z = north.
*/
var EquatorialCoordinates = class {
	constructor(ra, dec, dist, vec) {
		this.ra = VerifyNumber(ra);
		this.dec = VerifyNumber(dec);
		this.dist = VerifyNumber(dist);
		this.vec = vec;
	}
};
/**
* @brief Contains a rotation matrix that can be used to transform one coordinate system to another.
*
* @property {number[][]} rot
*      A normalized 3x3 rotation matrix. For example, the identity matrix is represented
*      as `[[1, 0, 0], [0, 1, 0], [0, 0, 1]]`.
*/
var RotationMatrix = class {
	constructor(rot) {
		this.rot = rot;
	}
};
/**
* @brief Represents the location of an object seen by an observer on the Earth.
*
* Holds azimuth (compass direction) and altitude (angle above/below the horizon)
* of a celestial object as seen by an observer at a particular location on the Earth's surface.
* Also holds right ascension and declination of the same object.
* All of these coordinates are optionally adjusted for atmospheric refraction;
* therefore the right ascension and declination values may not exactly match
* those found inside a corresponding {@link EquatorialCoordinates} object.
*
* @property {number} azimuth
*      A horizontal compass direction angle in degrees measured starting at north
*      and increasing positively toward the east.
*      The value is in the range [0, 360).
*      North = 0, east = 90, south = 180, west = 270.
*
* @property {number} altitude
*      A vertical angle in degrees above (positive) or below (negative) the horizon.
*      The value is in the range [-90, +90].
*      The altitude angle is optionally adjusted upward due to atmospheric refraction.
*
* @property {number} ra
*      The right ascension of the celestial body in sidereal hours.
*      The value is in the reange [0, 24).
*      If `altitude` was adjusted for atmospheric reaction, `ra`
*      is likewise adjusted.
*
* @property {number} dec
*      The declination of of the celestial body in degrees.
*      The value in the range [-90, +90].
*      If `altitude` was adjusted for atmospheric reaction, `dec`
*      is likewise adjusted.
*/
var HorizontalCoordinates = class {
	constructor(azimuth, altitude, ra, dec) {
		this.azimuth = VerifyNumber(azimuth);
		this.altitude = VerifyNumber(altitude);
		this.ra = VerifyNumber(ra);
		this.dec = VerifyNumber(dec);
	}
};
/**
* @brief Ecliptic coordinates of a celestial body.
*
* The origin and date of the coordinate system may vary depending on the caller's usage.
* In general, ecliptic coordinates are measured with respect to the mean plane of the Earth's
* orbit around the Sun.
* Includes Cartesian coordinates `(ex, ey, ez)` measured in
* <a href="https://en.wikipedia.org/wiki/Astronomical_unit">astronomical units</a> (AU)
* and spherical coordinates `(elon, elat)` measured in degrees.
*
* @property {Vector} vec
*      Ecliptic cartesian vector with components measured in astronomical units (AU).
*      The x-axis is within the ecliptic plane and is oriented in the direction of the
*      <a href="https://en.wikipedia.org/wiki/Equinox_(celestial_coordinates)">equinox</a>.
*      The y-axis is within the ecliptic plane and is oriented 90 degrees
*      counterclockwise from the equinox, as seen from above the Sun's north pole.
*      The z-axis is oriented perpendicular to the ecliptic plane,
*      along the direction of the Sun's north pole.
*
* @property {number} elat
*      The ecliptic latitude of the body in degrees.
*      This is the angle north or south of the ecliptic plane.
*      The value is in the range [-90, +90].
*      Positive values are north and negative values are south.
*
* @property {number} elon
*      The ecliptic longitude of the body in degrees.
*      This is the angle measured counterclockwise around the ecliptic plane,
*      as seen from above the Sun's north pole.
*      This is the same direction that the Earth orbits around the Sun.
*      The angle is measured starting at 0 from the equinox and increases
*      up to 360 degrees.
*/
var EclipticCoordinates = class {
	constructor(vec, elat, elon) {
		this.vec = vec;
		this.elat = VerifyNumber(elat);
		this.elon = VerifyNumber(elon);
	}
};
function VectorFromArray(av, time) {
	return new Vector(av[0], av[1], av[2], time);
}
function vector2radec(pos, time) {
	const vec = VectorFromArray(pos, time);
	const xyproj = vec.x * vec.x + vec.y * vec.y;
	const dist = Math.sqrt(xyproj + vec.z * vec.z);
	if (xyproj === 0) {
		if (vec.z === 0) throw "Indeterminate sky coordinates";
		return new EquatorialCoordinates(0, vec.z < 0 ? -90 : 90, dist, vec);
	}
	let ra = RAD2HOUR * Math.atan2(vec.y, vec.x);
	if (ra < 0) ra += 24;
	const dec = RAD2DEG * Math.atan2(pos[2], Math.sqrt(xyproj));
	return new EquatorialCoordinates(ra, dec, dist, vec);
}
function spin(angle, pos) {
	const angr = angle * DEG2RAD;
	const c = Math.cos(angr);
	const s = Math.sin(angr);
	return [
		c * pos[0] + s * pos[1],
		c * pos[1] - s * pos[0],
		pos[2]
	];
}
/**
* @brief Converts equatorial coordinates to horizontal coordinates.
*
* Given a date and time, a geographic location of an observer on the Earth, and
* equatorial coordinates (right ascension and declination) of a celestial body,
* returns horizontal coordinates (azimuth and altitude angles) for that body
* as seen by that observer. Allows optional correction for atmospheric refraction.
*
* @param {FlexibleDateTime} date
*      The date and time for which to find horizontal coordinates.
*
* @param {Observer} observer
*      The location of the observer for which to find horizontal coordinates.
*
* @param {number} ra
*      Right ascension in sidereal hours of the celestial object,
*      referred to the mean equinox of date for the J2000 epoch.
*
* @param {number} dec
*      Declination in degrees of the celestial object,
*      referred to the mean equator of date for the J2000 epoch.
*      Positive values are north of the celestial equator and negative values are south.
*
* @param {string} refraction
*      If omitted or has a false-like value (false, null, undefined, etc.)
*      the calculations are performed without any correction for atmospheric
*      refraction. If the value is the string `"normal"`,
*      uses the recommended refraction correction based on Meeus "Astronomical Algorithms"
*      with a linear taper more than 1 degree below the horizon. The linear
*      taper causes the refraction to linearly approach 0 as the altitude of the
*      body approaches the nadir (-90 degrees).
*      If the value is the string `"jplhor"`, uses a JPL Horizons
*      compatible formula. This is the same algorithm as `"normal"`,
*      only without linear tapering; this can result in physically impossible
*      altitudes of less than -90 degrees, which may cause problems for some applications.
*      (The `"jplhor"` option was created for unit testing against data
*      generated by JPL Horizons, and is otherwise not recommended for use.)
*
* @returns {HorizontalCoordinates}
*/
function Horizon(date, observer, ra, dec, refraction) {
	let time = MakeTime(date);
	VerifyObserver(observer);
	VerifyNumber(ra);
	VerifyNumber(dec);
	const sinlat = Math.sin(observer.latitude * DEG2RAD);
	const coslat = Math.cos(observer.latitude * DEG2RAD);
	const sinlon = Math.sin(observer.longitude * DEG2RAD);
	const coslon = Math.cos(observer.longitude * DEG2RAD);
	const sindc = Math.sin(dec * DEG2RAD);
	const cosdc = Math.cos(dec * DEG2RAD);
	const sinra = Math.sin(ra * HOUR2RAD);
	const cosra = Math.cos(ra * HOUR2RAD);
	let uze = [
		coslat * coslon,
		coslat * sinlon,
		sinlat
	];
	let une = [
		-sinlat * coslon,
		-sinlat * sinlon,
		coslat
	];
	let uwe = [
		sinlon,
		-coslon,
		0
	];
	const spin_angle = -15 * sidereal_time(time);
	let uz = spin(spin_angle, uze);
	let un = spin(spin_angle, une);
	let uw = spin(spin_angle, uwe);
	let p = [
		cosdc * cosra,
		cosdc * sinra,
		sindc
	];
	const pz = p[0] * uz[0] + p[1] * uz[1] + p[2] * uz[2];
	const pn = p[0] * un[0] + p[1] * un[1] + p[2] * un[2];
	const pw = p[0] * uw[0] + p[1] * uw[1] + p[2] * uw[2];
	let proj = Math.hypot(pn, pw);
	let az;
	if (proj > 0) {
		az = -57.29577951308232 * Math.atan2(pw, pn);
		if (az < 0) az += 360;
	} else az = 0;
	let zd = RAD2DEG * Math.atan2(proj, pz);
	let out_ra = ra;
	let out_dec = dec;
	if (refraction) {
		let zd0 = zd;
		let refr = Refraction(refraction, 90 - zd);
		zd -= refr;
		if (refr > 0 && zd > 3e-4) {
			const sinzd = Math.sin(zd * DEG2RAD);
			const coszd = Math.cos(zd * DEG2RAD);
			const sinzd0 = Math.sin(zd0 * DEG2RAD);
			const coszd0 = Math.cos(zd0 * DEG2RAD);
			const pr = [];
			for (let j = 0; j < 3; ++j) pr.push((p[j] - coszd0 * uz[j]) / sinzd0 * sinzd + uz[j] * coszd);
			proj = Math.hypot(pr[0], pr[1]);
			if (proj > 0) {
				out_ra = RAD2HOUR * Math.atan2(pr[1], pr[0]);
				if (out_ra < 0) out_ra += 24;
			} else out_ra = 0;
			out_dec = RAD2DEG * Math.atan2(pr[2], proj);
		}
	}
	return new HorizontalCoordinates(az, 90 - zd, out_ra, out_dec);
}
function VerifyObserver(observer) {
	if (!(observer instanceof Observer)) throw `Not an instance of the Observer class: ${observer}`;
	VerifyNumber(observer.latitude);
	VerifyNumber(observer.longitude);
	VerifyNumber(observer.height);
	if (observer.latitude < -90 || observer.latitude > 90) throw `Latitude ${observer.latitude} is out of range. Must be -90..+90.`;
	return observer;
}
/**
* @brief Represents the geographic location of an observer on the surface of the Earth.
*
* @property {number} latitude
*      The observer's geographic latitude in degrees north of the Earth's equator.
*      The value is negative for observers south of the equator.
*      Must be in the range -90 to +90.
*
* @property {number} longitude
*      The observer's geographic longitude in degrees east of the prime meridian
*      passing through Greenwich, England.
*      The value is negative for observers west of the prime meridian.
*      The value should be kept in the range -180 to +180 to minimize floating point errors.
*
* @property {number} height
*      The observer's elevation above mean sea level, expressed in meters.
*/
var Observer = class {
	constructor(latitude, longitude, height) {
		this.latitude = latitude;
		this.longitude = longitude;
		this.height = height;
		VerifyObserver(this);
	}
};
/**
* @brief Calculates equatorial coordinates of a Solar System body at a given time.
*
* Returns topocentric equatorial coordinates (right ascension and declination)
* in one of two different systems: J2000 or true-equator-of-date.
* Allows optional correction for aberration.
* Always corrects for light travel time (represents the object as seen by the observer
* with light traveling to the Earth at finite speed, not where the object is right now).
* <i>Topocentric</i> refers to a position as seen by an observer on the surface of the Earth.
* This function corrects for
* <a href="https://en.wikipedia.org/wiki/Parallax">parallax</a>
* of the object between a geocentric observer and a topocentric observer.
* This is most significant for the Moon, because it is so close to the Earth.
* However, it can have a small effect on the apparent positions of other bodies.
*
* @param {Body} body
*      The body for which to find equatorial coordinates.
*      Not allowed to be `Body.Earth`.
*
* @param {FlexibleDateTime} date
*      Specifies the date and time at which the body is to be observed.
*
* @param {Observer} observer
*      The location on the Earth of the observer.
*
* @param {bool} ofdate
*      Pass `true` to return equatorial coordinates of date,
*      i.e. corrected for precession and nutation at the given date.
*      This is needed to get correct horizontal coordinates when you call
*      {@link Horizon}.
*      Pass `false` to return equatorial coordinates in the J2000 system.
*
* @param {bool} aberration
*      Pass `true` to correct for
*      <a href="https://en.wikipedia.org/wiki/Aberration_of_light">aberration</a>,
*      or `false` to leave uncorrected.
*
* @returns {EquatorialCoordinates}
*      The topocentric coordinates of the body as adjusted for the given observer.
*/
function Equator(body, date, observer, ofdate, aberration) {
	VerifyObserver(observer);
	VerifyBoolean(ofdate);
	VerifyBoolean(aberration);
	const time = MakeTime(date);
	const gc_observer = geo_pos(time, observer);
	const gc = GeoVector(body, time, aberration);
	const j2000 = [
		gc.x - gc_observer[0],
		gc.y - gc_observer[1],
		gc.z - gc_observer[2]
	];
	if (!ofdate) return vector2radec(j2000, time);
	return vector2radec(gyration(j2000, time, PrecessDirection.From2000), time);
}
function RotateEquatorialToEcliptic(equ, cos_ob, sin_ob) {
	const ex = equ.x;
	const ey = equ.y * cos_ob + equ.z * sin_ob;
	const ez = -equ.y * sin_ob + equ.z * cos_ob;
	const xyproj = Math.hypot(ex, ey);
	let elon = 0;
	if (xyproj > 0) {
		elon = RAD2DEG * Math.atan2(ey, ex);
		if (elon < 0) elon += 360;
	}
	let elat = RAD2DEG * Math.atan2(ez, xyproj);
	return new EclipticCoordinates(new Vector(ex, ey, ez, equ.t), elat, elon);
}
/**
* @brief Converts a J2000 mean equator (EQJ) vector to a true ecliptic of date (ETC) vector and angles.
*
* Given coordinates relative to the Earth's equator at J2000 (the instant of noon UTC
* on 1 January 2000), this function converts those coordinates to true ecliptic coordinates
* that are relative to the plane of the Earth's orbit around the Sun on that date.
*
* @param {Vector} eqj
*      Equatorial coordinates in the EQJ frame of reference.
*      You can call {@link GeoVector} to obtain suitable equatorial coordinates.
*
* @returns {EclipticCoordinates}
*/
function Ecliptic(eqj) {
	const et = e_tilt(eqj.t);
	const [x, y, z] = nutation(precession([
		eqj.x,
		eqj.y,
		eqj.z
	], eqj.t, PrecessDirection.From2000), eqj.t, PrecessDirection.From2000);
	const eqd = new Vector(x, y, z, eqj.t);
	const tobl = et.tobl * DEG2RAD;
	return RotateEquatorialToEcliptic(eqd, Math.cos(tobl), Math.sin(tobl));
}
/**
* @brief Calculates equatorial geocentric Cartesian coordinates for the Moon.
*
* Given a time of observation, calculates the Moon's position as a vector.
* The vector gives the location of the Moon's center relative to the Earth's center
* with x-, y-, and z-components measured in astronomical units.
* The coordinates are oriented with respect to the Earth's equator at the J2000 epoch.
* In Astronomy Engine, this orientation is called EQJ.
* Based on the Nautical Almanac Office's <i>Improved Lunar Ephemeris</i> of 1954,
* which in turn derives from E. W. Brown's lunar theories.
* Adapted from Turbo Pascal code from the book
* <a href="https://www.springer.com/us/book/9783540672210">Astronomy on the Personal Computer</a>
* by Montenbruck and Pfleger.
*
* @param {FlexibleDateTime} date
*      The date and time for which to calculate the Moon's geocentric position.
*
* @returns {Vector}
*/
function GeoMoon(date) {
	const time = MakeTime(date);
	const moon = CalcMoon(time);
	const dist_cos_lat = moon.distance_au * Math.cos(moon.geo_eclip_lat);
	const mpos2 = precession(ecl2equ_vec(time, [
		dist_cos_lat * Math.cos(moon.geo_eclip_lon),
		dist_cos_lat * Math.sin(moon.geo_eclip_lon),
		moon.distance_au * Math.sin(moon.geo_eclip_lat)
	]), time, PrecessDirection.Into2000);
	return new Vector(mpos2[0], mpos2[1], mpos2[2], time);
}
/**
* @brief Calculates equatorial geocentric position and velocity of the Moon at a given time.
*
* Given a time of observation, calculates the Moon's position and velocity vectors.
* The position and velocity are of the Moon's center relative to the Earth's center.
* The position (x, y, z) components are expressed in AU (astronomical units).
* The velocity (vx, vy, vz) components are expressed in AU/day.
* The coordinates are oriented with respect to the Earth's equator at the J2000 epoch.
* In Astronomy Engine, this orientation is called EQJ.
* If you need the Moon's position only, and not its velocity,
* it is much more efficient to use {@link GeoMoon} instead.
*
* @param {FlexibleDateTime} date
*      The date and time for which to calculate the Moon's geocentric state.
*
* @returns {StateVector}
*/
function GeoMoonState(date) {
	const time = MakeTime(date);
	const dt = 1e-5;
	const t1 = time.AddDays(-1e-5);
	const t2 = time.AddDays(1e-5);
	const r1 = GeoMoon(t1);
	const r2 = GeoMoon(t2);
	return new StateVector((r1.x + r2.x) / 2, (r1.y + r2.y) / 2, (r1.z + r2.z) / 2, (r2.x - r1.x) / (2 * dt), (r2.y - r1.y) / (2 * dt), (r2.z - r1.z) / (2 * dt), time);
}
/**
* @brief Calculates the geocentric position and velocity of the Earth/Moon barycenter.
*
* Given a time of observation, calculates the geocentric position and velocity vectors
* of the Earth/Moon barycenter (EMB).
* The position (x, y, z) components are expressed in AU (astronomical units).
* The velocity (vx, vy, vz) components are expressed in AU/day.
*
* @param {FlexibleDateTime} date
*      The date and time for which to calculate the EMB's geocentric state.
*
* @returns {StateVector}
*/
function GeoEmbState(date) {
	const time = MakeTime(date);
	const s = GeoMoonState(time);
	const d = 82.30056;
	return new StateVector(s.x / d, s.y / d, s.z / d, s.vx / d, s.vy / d, s.vz / d, time);
}
function VsopFormula(formula, t, clamp_angle) {
	let tpower = 1;
	let coord = 0;
	for (let series of formula) {
		let sum = 0;
		for (let [ampl, phas, freq] of series) sum += ampl * Math.cos(phas + t * freq);
		let incr = tpower * sum;
		if (clamp_angle) incr %= PI2;
		coord += incr;
		tpower *= t;
	}
	return coord;
}
function VsopDeriv(formula, t) {
	let tpower = 1;
	let dpower = 0;
	let deriv = 0;
	let s = 0;
	for (let series of formula) {
		let sin_sum = 0;
		let cos_sum = 0;
		for (let [ampl, phas, freq] of series) {
			let angle = phas + t * freq;
			sin_sum += ampl * freq * Math.sin(angle);
			if (s > 0) cos_sum += ampl * Math.cos(angle);
		}
		deriv += s * dpower * cos_sum - tpower * sin_sum;
		dpower = tpower;
		tpower *= t;
		++s;
	}
	return deriv;
}
var DAYS_PER_MILLENNIUM = 365250;
var LON_INDEX = 0;
var LAT_INDEX = 1;
var RAD_INDEX = 2;
function VsopRotate(eclip) {
	return new TerseVector(eclip[0] + 4.4036e-7 * eclip[1] - 1.90919e-7 * eclip[2], -4.79966e-7 * eclip[0] + .917482137087 * eclip[1] - .397776982902 * eclip[2], .397776982902 * eclip[1] + .917482137087 * eclip[2]);
}
function VsopSphereToRect(lon, lat, radius) {
	const r_coslat = radius * Math.cos(lat);
	const coslon = Math.cos(lon);
	const sinlon = Math.sin(lon);
	return [
		r_coslat * coslon,
		r_coslat * sinlon,
		radius * Math.sin(lat)
	];
}
function CalcVsop(model, time) {
	const t = time.tt / DAYS_PER_MILLENNIUM;
	return VsopRotate(VsopSphereToRect(VsopFormula(model[LON_INDEX], t, true), VsopFormula(model[LAT_INDEX], t, false), VsopFormula(model[RAD_INDEX], t, false))).ToAstroVector(time);
}
function CalcVsopPosVel(model, tt) {
	const t = tt / DAYS_PER_MILLENNIUM;
	const lon = VsopFormula(model[LON_INDEX], t, true);
	const lat = VsopFormula(model[LAT_INDEX], t, false);
	const rad = VsopFormula(model[RAD_INDEX], t, false);
	const dlon_dt = VsopDeriv(model[LON_INDEX], t);
	const dlat_dt = VsopDeriv(model[LAT_INDEX], t);
	const drad_dt = VsopDeriv(model[RAD_INDEX], t);
	const coslon = Math.cos(lon);
	const sinlon = Math.sin(lon);
	const coslat = Math.cos(lat);
	const sinlat = Math.sin(lat);
	const vx = +(drad_dt * coslat * coslon) - rad * sinlat * coslon * dlat_dt - rad * coslat * sinlon * dlon_dt;
	const vy = +(drad_dt * coslat * sinlon) - rad * sinlat * sinlon * dlat_dt + rad * coslat * coslon * dlon_dt;
	const vz = +(drad_dt * sinlat) + rad * coslat * dlat_dt;
	const eclip_pos = VsopSphereToRect(lon, lat, rad);
	const eclip_vel = [
		vx / DAYS_PER_MILLENNIUM,
		vy / DAYS_PER_MILLENNIUM,
		vz / DAYS_PER_MILLENNIUM
	];
	return new body_state_t(tt, VsopRotate(eclip_pos), VsopRotate(eclip_vel));
}
function AdjustBarycenter(ssb, time, body, pmass) {
	const shift = pmass / (pmass + SUN_GM);
	const planet = CalcVsop(vsop[body], time);
	ssb.x += shift * planet.x;
	ssb.y += shift * planet.y;
	ssb.z += shift * planet.z;
}
function CalcSolarSystemBarycenter(time) {
	const ssb = new Vector(0, 0, 0, time);
	AdjustBarycenter(ssb, time, Body.Jupiter, JUPITER_GM);
	AdjustBarycenter(ssb, time, Body.Saturn, SATURN_GM);
	AdjustBarycenter(ssb, time, Body.Uranus, URANUS_GM);
	AdjustBarycenter(ssb, time, Body.Neptune, NEPTUNE_GM);
	return ssb;
}
var PLUTO_TIME_STEP = 29200;
var PLUTO_DT = 146;
var PlutoStateTable = [
	[
		-73e4,
		[
			-26.118207232108,
			-14.376168177825,
			3.384402515299
		],
		[
			.0016339372163656,
			-.0027861699588508,
			-.0013585880229445
		]
	],
	[
		-700800,
		[
			41.974905202127,
			-.448502952929,
			-12.770351505989
		],
		[
			.00073458569351457,
			.0022785014891658,
			.00048619778602049
		]
	],
	[
		-671600,
		[
			14.706930780744,
			44.269110540027,
			9.353698474772
		],
		[
			-.00210001479998,
			.00022295915939915,
			.00070143443551414
		]
	],
	[
		-642400,
		[
			-29.441003929957,
			-6.43016153057,
			6.858481011305
		],
		[
			.00084495803960544,
			-.0030783914758711,
			-.0012106305981192
		]
	],
	[
		-613200,
		[
			39.444396946234,
			-6.557989760571,
			-13.913760296463
		],
		[
			.0011480029005873,
			.0022400006880665,
			.00035168075922288
		]
	],
	[
		-584e3,
		[
			20.2303809507,
			43.266966657189,
			7.382966091923
		],
		[
			-.0019754081700585,
			.00053457141292226,
			.00075929169129793
		]
	],
	[
		-554800,
		[
			-30.65832536462,
			2.093818874552,
			9.880531138071
		],
		[
			61010603013347e-18,
			-.0031326500935382,
			-.00099346125151067
		]
	],
	[
		-525600,
		[
			35.737703251673,
			-12.587706024764,
			-14.677847247563
		],
		[
			.0015802939375649,
			.0021347678412429,
			.00019074436384343
		]
	],
	[
		-496400,
		[
			25.466295188546,
			41.367478338417,
			5.216476873382
		],
		[
			-.0018054401046468,
			.0008328308359951,
			.00080260156912107
		]
	],
	[
		-467200,
		[
			-29.847174904071,
			10.636426313081,
			12.297904180106
		],
		[
			-.00063257063052907,
			-.0029969577578221,
			-.00074476074151596
		]
	],
	[
		-438e3,
		[
			30.774692107687,
			-18.236637015304,
			-14.945535879896
		],
		[
			.0020113162005465,
			.0019353827024189,
			-20937793168297e-19
		]
	],
	[
		-408800,
		[
			30.243153324028,
			38.656267888503,
			2.938501750218
		],
		[
			-.0016052508674468,
			.0011183495337525,
			.00083333973416824
		]
	],
	[
		-379600,
		[
			-27.288984772533,
			18.643162147874,
			14.023633623329
		],
		[
			-.0011856388898191,
			-.0027170609282181,
			-.00049015526126399
		]
	],
	[
		-350400,
		[
			24.519605196774,
			-23.245756064727,
			-14.626862367368
		],
		[
			.0024322321483154,
			.0016062008146048,
			-.00023369181613312
		]
	],
	[
		-321200,
		[
			34.505274805875,
			35.125338586954,
			.557361475637
		],
		[
			-.0013824391637782,
			.0013833397561817,
			.00084823598806262
		]
	],
	[
		-292e3,
		[
			-23.275363915119,
			25.818514298769,
			15.055381588598
		],
		[
			-.0016062295460975,
			-.0023395961498533,
			-.00024377362639479
		]
	],
	[
		-262800,
		[
			17.050384798092,
			-27.180376290126,
			-13.608963321694
		],
		[
			.0028175521080578,
			.0011358749093955,
			-.00049548725258825
		]
	],
	[
		-233600,
		[
			38.093671910285,
			30.880588383337,
			-1.843688067413
		],
		[
			-.0011317697153459,
			.0016128814698472,
			.00084177586176055
		]
	],
	[
		-204400,
		[
			-18.197852930878,
			31.932869934309,
			15.438294826279
		],
		[
			-.0019117272501813,
			-.0019146495909842,
			-19657304369835e-18
		]
	],
	[
		-175200,
		[
			8.528924039997,
			-29.618422200048,
			-11.805400994258
		],
		[
			.0031034370787005,
			.0005139363329243,
			-.00077293066202546
		]
	],
	[
		-146e3,
		[
			40.94685725864,
			25.904973592021,
			-4.256336240499
		],
		[
			-.00083652705194051,
			.0018129497136404,
			.0008156422827306
		]
	],
	[
		-116800,
		[
			-12.326958895325,
			36.881883446292,
			15.217158258711
		],
		[
			-.0021166103705038,
			-.001481442003599,
			.00017401209844705
		]
	],
	[
		-87600,
		[
			-.633258375909,
			-30.018759794709,
			-9.17193287495
		],
		[
			.0032016994581737,
			-.00025279858672148,
			-.0010411088271861
		]
	],
	[
		-58400,
		[
			42.936048423883,
			20.344685584452,
			-6.588027007912
		],
		[
			-.00050525450073192,
			.0019910074335507,
			.00077440196540269
		]
	],
	[
		-29200,
		[
			-5.975910552974,
			40.61180995846,
			14.470131723673
		],
		[
			-.0022184202156107,
			-.0010562361130164,
			.00033652250216211
		]
	],
	[
		0,
		[
			-9.875369580774,
			-27.978926224737,
			-5.753711824704
		],
		[
			.0030287533248818,
			-.0011276087003636,
			-.0012651326732361
		]
	],
	[
		29200,
		[
			43.958831986165,
			14.214147973292,
			-8.808306227163
		],
		[
			-.00014717608981871,
			.0021404187242141,
			.00071486567806614
		]
	],
	[
		58400,
		[
			.67813676352,
			43.094461639362,
			13.243238780721
		],
		[
			-.0022358226110718,
			-.00063233636090933,
			.00047664798895648
		]
	],
	[
		87600,
		[
			-18.282602096834,
			-23.30503958666,
			-1.766620508028
		],
		[
			.0025567245263557,
			-.0019902940754171,
			-.0013943491701082
		]
	],
	[
		116800,
		[
			43.873338744526,
			7.700705617215,
			-10.814273666425
		],
		[
			.00023174803055677,
			.0022402163127924,
			.00062988756452032
		]
	],
	[
		146e3,
		[
			7.392949027906,
			44.382678951534,
			11.629500214854
		],
		[
			-.002193281545383,
			-.00021751799585364,
			.00059556516201114
		]
	],
	[
		175200,
		[
			-24.981690229261,
			-16.204012851426,
			2.466457544298
		],
		[
			.001819398914958,
			-.0026765419531201,
			-.0013848283502247
		]
	],
	[
		204400,
		[
			42.530187039511,
			.845935508021,
			-12.554907527683
		],
		[
			.00065059779150669,
			.0022725657282262,
			.00051133743202822
		]
	],
	[
		233600,
		[
			13.999526486822,
			44.462363044894,
			9.669418486465
		],
		[
			-.0021079296569252,
			.00017533423831993,
			.00069128485798076
		]
	],
	[
		262800,
		[
			-29.184024803031,
			-7.371243995762,
			6.493275957928
		],
		[
			.00093581363109681,
			-.0030610357109184,
			-.0012364201089345
		]
	],
	[
		292e3,
		[
			39.831980671753,
			-6.078405766765,
			-13.909815358656
		],
		[
			.0011117769689167,
			.0022362097830152,
			.00036230548231153
		]
	],
	[
		321200,
		[
			20.294955108476,
			43.417190420251,
			7.450091985932
		],
		[
			-.0019742157451535,
			.00053102050468554,
			.00075938408813008
		]
	],
	[
		350400,
		[
			-30.66999230216,
			2.318743558955,
			9.973480913858
		],
		[
			45605107450676e-18,
			-.0031308219926928,
			-.00099066533301924
		]
	],
	[
		379600,
		[
			35.626122155983,
			-12.897647509224,
			-14.777586508444
		],
		[
			.0016015684949743,
			.0021171931182284,
			.00018002516202204
		]
	],
	[
		408800,
		[
			26.133186148561,
			41.232139187599,
			5.00640132622
		],
		[
			-.0017857704419579,
			.00086046232702817,
			.00080614690298954
		]
	],
	[
		438e3,
		[
			-29.57674022923,
			11.863535943587,
			12.631323039872
		],
		[
			-.00072292830060955,
			-.0029587820140709,
			-.000708242964503
		]
	],
	[
		467200,
		[
			29.910805787391,
			-19.159019294,
			-15.013363865194
		],
		[
			.0020871080437997,
			.0018848372554514,
			-38528655083926e-18
		]
	],
	[
		496400,
		[
			31.375957451819,
			38.050372720763,
			2.433138343754
		],
		[
			-.0015546055556611,
			.0011699815465629,
			.00083565439266001
		]
	],
	[
		525600,
		[
			-26.360071336928,
			20.662505904952,
			14.414696258958
		],
		[
			-.0013142373118349,
			-.0026236647854842,
			-.00042542017598193
		]
	],
	[
		554800,
		[
			22.599441488648,
			-24.508879898306,
			-14.484045731468
		],
		[
			.0025454108304806,
			.0014917058755191,
			-.00030243665086079
		]
	],
	[
		584e3,
		[
			35.877864013014,
			33.894226366071,
			-.224524636277
		],
		[
			-.0012941245730845,
			.0014560427668319,
			.00084762160640137
		]
	],
	[
		613200,
		[
			-21.538149762417,
			28.204068269761,
			15.321973799534
		],
		[
			-.001731211740901,
			-.0021939631314577,
			-.0001631691327518
		]
	],
	[
		642400,
		[
			13.971521374415,
			-28.339941764789,
			-13.083792871886
		],
		[
			.0029334630526035,
			.00091860931752944,
			-.00059939422488627
		]
	],
	[
		671600,
		[
			39.526942044143,
			28.93989736011,
			-2.872799527539
		],
		[
			-.0010068481658095,
			.001702113288809,
			.00083578230511981
		]
	],
	[
		700800,
		[
			-15.576200701394,
			34.399412961275,
			15.466033737854
		],
		[
			-.0020098814612884,
			-.0017191109825989,
			70414782780416e-18
		]
	],
	[
		73e4,
		[
			4.24325283709,
			-30.118201690825,
			-10.707441231349
		],
		[
			.0031725847067411,
			.0001609846120227,
			-.00090672150593868
		]
	]
];
var TerseVector = class TerseVector {
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
	clone() {
		return new TerseVector(this.x, this.y, this.z);
	}
	ToAstroVector(t) {
		return new Vector(this.x, this.y, this.z, t);
	}
	static zero() {
		return new TerseVector(0, 0, 0);
	}
	quadrature() {
		return this.x * this.x + this.y * this.y + this.z * this.z;
	}
	add(other) {
		return new TerseVector(this.x + other.x, this.y + other.y, this.z + other.z);
	}
	sub(other) {
		return new TerseVector(this.x - other.x, this.y - other.y, this.z - other.z);
	}
	incr(other) {
		this.x += other.x;
		this.y += other.y;
		this.z += other.z;
	}
	decr(other) {
		this.x -= other.x;
		this.y -= other.y;
		this.z -= other.z;
	}
	mul(scalar) {
		return new TerseVector(scalar * this.x, scalar * this.y, scalar * this.z);
	}
	div(scalar) {
		return new TerseVector(this.x / scalar, this.y / scalar, this.z / scalar);
	}
	mean(other) {
		return new TerseVector((this.x + other.x) / 2, (this.y + other.y) / 2, (this.z + other.z) / 2);
	}
	neg() {
		return new TerseVector(-this.x, -this.y, -this.z);
	}
};
var body_state_t = class body_state_t {
	constructor(tt, r, v) {
		this.tt = tt;
		this.r = r;
		this.v = v;
	}
	clone() {
		return new body_state_t(this.tt, this.r, this.v);
	}
	sub(other) {
		return new body_state_t(this.tt, this.r.sub(other.r), this.v.sub(other.v));
	}
};
function BodyStateFromTable(entry) {
	let [tt, [rx, ry, rz], [vx, vy, vz]] = entry;
	return new body_state_t(tt, new TerseVector(rx, ry, rz), new TerseVector(vx, vy, vz));
}
function AdjustBarycenterPosVel(ssb, tt, body, planet_gm) {
	const shift = planet_gm / (planet_gm + SUN_GM);
	const planet = CalcVsopPosVel(vsop[body], tt);
	ssb.r.incr(planet.r.mul(shift));
	ssb.v.incr(planet.v.mul(shift));
	return planet;
}
function AccelerationIncrement(small_pos, gm, major_pos) {
	const delta = major_pos.sub(small_pos);
	const r2 = delta.quadrature();
	return delta.mul(gm / (r2 * Math.sqrt(r2)));
}
var major_bodies_t = class {
	constructor(tt) {
		let ssb = new body_state_t(tt, new TerseVector(0, 0, 0), new TerseVector(0, 0, 0));
		this.Jupiter = AdjustBarycenterPosVel(ssb, tt, Body.Jupiter, JUPITER_GM);
		this.Saturn = AdjustBarycenterPosVel(ssb, tt, Body.Saturn, SATURN_GM);
		this.Uranus = AdjustBarycenterPosVel(ssb, tt, Body.Uranus, URANUS_GM);
		this.Neptune = AdjustBarycenterPosVel(ssb, tt, Body.Neptune, NEPTUNE_GM);
		this.Jupiter.r.decr(ssb.r);
		this.Jupiter.v.decr(ssb.v);
		this.Saturn.r.decr(ssb.r);
		this.Saturn.v.decr(ssb.v);
		this.Uranus.r.decr(ssb.r);
		this.Uranus.v.decr(ssb.v);
		this.Neptune.r.decr(ssb.r);
		this.Neptune.v.decr(ssb.v);
		this.Sun = new body_state_t(tt, ssb.r.mul(-1), ssb.v.mul(-1));
	}
	Acceleration(pos) {
		let acc = AccelerationIncrement(pos, SUN_GM, this.Sun.r);
		acc.incr(AccelerationIncrement(pos, JUPITER_GM, this.Jupiter.r));
		acc.incr(AccelerationIncrement(pos, SATURN_GM, this.Saturn.r));
		acc.incr(AccelerationIncrement(pos, URANUS_GM, this.Uranus.r));
		acc.incr(AccelerationIncrement(pos, NEPTUNE_GM, this.Neptune.r));
		return acc;
	}
};
/**
* @ignore
*
* @brief The state of a body at an incremental step in a gravity simulation.
*
* This is an internal data structure used to represent the
* position, velocity, and acceleration vectors of a body
* in a gravity simulation at a given moment in time.
*
* @property tt
*      The J2000 terrestrial time of the state [days].
*
* @property r
*      The position vector [au].
*
* @property v
*      The velocity vector [au/day].
*
* @property a
*      The acceleration vector [au/day^2].
*/
var body_grav_calc_t = class body_grav_calc_t {
	constructor(tt, r, v, a) {
		this.tt = tt;
		this.r = r;
		this.v = v;
		this.a = a;
	}
	clone() {
		return new body_grav_calc_t(this.tt, this.r.clone(), this.v.clone(), this.a.clone());
	}
};
var grav_sim_t = class {
	constructor(bary, grav) {
		this.bary = bary;
		this.grav = grav;
	}
};
function UpdatePosition(dt, r, v, a) {
	return new TerseVector(r.x + dt * (v.x + dt * a.x / 2), r.y + dt * (v.y + dt * a.y / 2), r.z + dt * (v.z + dt * a.z / 2));
}
function UpdateVelocity(dt, v, a) {
	return new TerseVector(v.x + dt * a.x, v.y + dt * a.y, v.z + dt * a.z);
}
function GravSim(tt2, calc1) {
	const dt = tt2 - calc1.tt;
	const bary2 = new major_bodies_t(tt2);
	const approx_pos = UpdatePosition(dt, calc1.r, calc1.v, calc1.a);
	const mean_acc = bary2.Acceleration(approx_pos).mean(calc1.a);
	const pos = UpdatePosition(dt, calc1.r, calc1.v, mean_acc);
	return new grav_sim_t(bary2, new body_grav_calc_t(tt2, pos, calc1.v.add(mean_acc.mul(dt)), bary2.Acceleration(pos)));
}
var pluto_cache = [];
function ClampIndex(frac, nsteps) {
	const index = Math.floor(frac);
	if (index < 0) return 0;
	if (index >= nsteps) return nsteps - 1;
	return index;
}
function GravFromState(entry) {
	const state = BodyStateFromTable(entry);
	const bary = new major_bodies_t(state.tt);
	const r = state.r.add(bary.Sun.r);
	const v = state.v.add(bary.Sun.v);
	const a = bary.Acceleration(r);
	return new grav_sim_t(bary, new body_grav_calc_t(state.tt, r, v, a));
}
function GetSegment(cache, tt) {
	const t0 = PlutoStateTable[0][0];
	if (tt < t0 || tt > PlutoStateTable[50][0]) return null;
	const seg_index = ClampIndex((tt - t0) / PLUTO_TIME_STEP, 50);
	if (!cache[seg_index]) {
		const seg = cache[seg_index] = [];
		seg[0] = GravFromState(PlutoStateTable[seg_index]).grav;
		seg[200] = GravFromState(PlutoStateTable[seg_index + 1]).grav;
		let i;
		let step_tt = seg[0].tt;
		for (i = 1; i < 200; ++i) seg[i] = GravSim(step_tt += PLUTO_DT, seg[i - 1]).grav;
		step_tt = seg[200].tt;
		var reverse = [];
		reverse[200] = seg[200];
		for (i = 199; i > 0; --i) reverse[i] = GravSim(step_tt -= PLUTO_DT, reverse[i + 1]).grav;
		for (i = 199; i > 0; --i) {
			const ramp = i / 200;
			seg[i].r = seg[i].r.mul(1 - ramp).add(reverse[i].r.mul(ramp));
			seg[i].v = seg[i].v.mul(1 - ramp).add(reverse[i].v.mul(ramp));
			seg[i].a = seg[i].a.mul(1 - ramp).add(reverse[i].a.mul(ramp));
		}
	}
	return cache[seg_index];
}
function CalcPlutoOneWay(entry, target_tt, dt) {
	let sim = GravFromState(entry);
	const n = Math.ceil((target_tt - sim.grav.tt) / dt);
	for (let i = 0; i < n; ++i) sim = GravSim(i + 1 === n ? target_tt : sim.grav.tt + dt, sim.grav);
	return sim;
}
function CalcPluto(time, helio) {
	let r, v, bary;
	const seg = GetSegment(pluto_cache, time.tt);
	if (!seg) {
		let sim;
		if (time.tt < PlutoStateTable[0][0]) sim = CalcPlutoOneWay(PlutoStateTable[0], time.tt, -146);
		else sim = CalcPlutoOneWay(PlutoStateTable[50], time.tt, 146);
		r = sim.grav.r;
		v = sim.grav.v;
		bary = sim.bary;
	} else {
		const left = ClampIndex((time.tt - seg[0].tt) / PLUTO_DT, 200);
		const s1 = seg[left];
		const s2 = seg[left + 1];
		const acc = s1.a.mean(s2.a);
		const ra = UpdatePosition(time.tt - s1.tt, s1.r, s1.v, acc);
		const va = UpdateVelocity(time.tt - s1.tt, s1.v, acc);
		const rb = UpdatePosition(time.tt - s2.tt, s2.r, s2.v, acc);
		const vb = UpdateVelocity(time.tt - s2.tt, s2.v, acc);
		const ramp = (time.tt - s1.tt) / PLUTO_DT;
		r = ra.mul(1 - ramp).add(rb.mul(ramp));
		v = va.mul(1 - ramp).add(vb.mul(ramp));
	}
	if (helio) {
		if (!bary) bary = new major_bodies_t(time.tt);
		r = r.sub(bary.Sun.r);
		v = v.sub(bary.Sun.v);
	}
	return new StateVector(r.x, r.y, r.z, v.x, v.y, v.z, time);
}
new RotationMatrix([
	[
		.999432765338654,
		-.0336771074697641,
		0
	],
	[
		.0303959428906285,
		.902057912352809,
		.430543388542295
	],
	[
		-.0144994559663353,
		-.430299169409101,
		.902569881273754
	]
]);
/**
* @brief Calculates a vector from the center of the Sun to the given body at the given time.
*
* Calculates heliocentric (i.e., with respect to the center of the Sun)
* Cartesian coordinates in the J2000 equatorial system of a celestial
* body at a specified time. The position is not corrected for light travel time or aberration.
*
* @param {Body} body
*      One of the following values:
*      `Body.Sun`, `Body.Moon`, `Body.Mercury`, `Body.Venus`,
*      `Body.Earth`, `Body.Mars`, `Body.Jupiter`, `Body.Saturn`,
*      `Body.Uranus`, `Body.Neptune`, `Body.Pluto`,
*      `Body.SSB`, or `Body.EMB`.
*      Also allowed to be a user-defined star created by {@link DefineStar}.
*
* @param {FlexibleDateTime} date
*      The date and time for which the body's position is to be calculated.
*
* @returns {Vector}
*/
function HelioVector(body, date) {
	var time = MakeTime(date);
	if (body in vsop) return CalcVsop(vsop[body], time);
	if (body === Body.Pluto) {
		const p = CalcPluto(time, true);
		return new Vector(p.x, p.y, p.z, time);
	}
	if (body === Body.Sun) return new Vector(0, 0, 0, time);
	if (body === Body.Moon) {
		var e = CalcVsop(vsop.Earth, time);
		var m = GeoMoon(time);
		return new Vector(e.x + m.x, e.y + m.y, e.z + m.z, time);
	}
	if (body === Body.EMB) {
		const e = CalcVsop(vsop.Earth, time);
		const m = GeoMoon(time);
		const denom = 82.30056;
		return new Vector(e.x + m.x / denom, e.y + m.y / denom, e.z + m.z / denom, time);
	}
	if (body === Body.SSB) return CalcSolarSystemBarycenter(time);
	const star = UserDefinedStar(body);
	if (star) return VectorFromSphere(new Spherical(star.dec, 15 * star.ra, star.dist), time);
	throw `HelioVector: Unknown body "${body}"`;
}
/**
* Solve for light travel time of a vector function.
*
* When observing a distant object, for example Jupiter as seen from Earth,
* the amount of time it takes for light to travel from the object to the
* observer can significantly affect the object's apparent position.
* This function is a generic solver that figures out how long in the
* past light must have left the observed object to reach the observer
* at the specified observation time. It requires passing in `func`
* to express an arbitrary position vector as a function of time.
*
* `CorrectLightTravel` repeatedly calls `func`, passing a series of time
* estimates in the past. Then `func` must return a relative position vector between
* the observer and the target. `CorrectLightTravel` keeps calling
* `func` with more and more refined estimates of the time light must have
* left the target to arrive at the observer.
*
* For common use cases, it is simpler to use {@link BackdatePosition}
* for calculating the light travel time correction of one body observing another body.
*
* For geocentric calculations, {@link GeoVector} also backdates the returned
* position vector for light travel time, only it returns the observation time in
* the returned vector's `t` field rather than the backdated time.
*
* @param {function(AstroTime): number} func
*      An arbitrary position vector as a function of time:
*      function({@link AstroTime}) =&gt; {@link Vector}.
*
* @param {AstroTime} time
*      The observation time for which to solve for light travel delay.
*
* @returns {AstroVector}
*      The position vector at the solved backdated time.
*      The `t` field holds the time that light left the observed
*      body to arrive at the observer at the observation time.
*/
function CorrectLightTravel(func, time) {
	let ltime = time;
	let dt = 0;
	for (let iter = 0; iter < 10; ++iter) {
		const pos = func(ltime);
		const lt = pos.Length() / C_AUDAY;
		if (lt > 1) throw `Object is too distant for light-travel solver.`;
		const ltime2 = time.AddDays(-lt);
		dt = Math.abs(ltime2.tt - ltime.tt);
		if (dt < 1e-9) return pos;
		ltime = ltime2;
	}
	throw `Light-travel time solver did not converge: dt = ${dt}`;
}
var BodyPosition = class {
	constructor(observerBody, targetBody, aberration, observerPos) {
		this.observerBody = observerBody;
		this.targetBody = targetBody;
		this.aberration = aberration;
		this.observerPos = observerPos;
	}
	Position(time) {
		if (this.aberration) this.observerPos = HelioVector(this.observerBody, time);
		const targetPos = HelioVector(this.targetBody, time);
		return new Vector(targetPos.x - this.observerPos.x, targetPos.y - this.observerPos.y, targetPos.z - this.observerPos.z, time);
	}
};
/**
* @brief Solve for light travel time correction of apparent position.
*
* When observing a distant object, for example Jupiter as seen from Earth,
* the amount of time it takes for light to travel from the object to the
* observer can significantly affect the object's apparent position.
*
* This function solves the light travel time correction for the apparent
* relative position vector of a target body as seen by an observer body
* at a given observation time.
*
* For geocentric calculations, {@link GeoVector} also includes light
* travel time correction, but the time `t` embedded in its returned vector
* refers to the observation time, not the backdated time that light left
* the observed body. Thus `BackdatePosition` provides direct
* access to the light departure time for callers that need it.
*
* For a more generalized light travel correction solver, see {@link CorrectLightTravel}.
*
* @param {FlexibleDateTime} date
*      The time of observation.
*
* @param {Body} observerBody
*      The body to be used as the observation location.
*
* @param {Body} targetBody
*      The body to be observed.
*
* @param {boolean} aberration
*      `true` to correct for aberration, or `false` to leave uncorrected.
*
* @returns {Vector}
*      The position vector at the solved backdated time.
*      The `t` field holds the time that light left the observed
*      body to arrive at the observer at the observation time.
*/
function BackdatePosition(date, observerBody, targetBody, aberration) {
	VerifyBoolean(aberration);
	const time = MakeTime(date);
	if (UserDefinedStar(targetBody)) {
		const tvec = HelioVector(targetBody, time);
		if (aberration) {
			const ostate = HelioState(observerBody, time);
			const rvec = new Vector(tvec.x - ostate.x, tvec.y - ostate.y, tvec.z - ostate.z, time);
			const s = C_AUDAY / rvec.Length();
			return new Vector(rvec.x + ostate.vx / s, rvec.y + ostate.vy / s, rvec.z + ostate.vz / s, time);
		}
		const ovec = HelioVector(observerBody, time);
		return new Vector(tvec.x - ovec.x, tvec.y - ovec.y, tvec.z - ovec.z, time);
	}
	let observerPos;
	if (aberration) observerPos = new Vector(0, 0, 0, time);
	else observerPos = HelioVector(observerBody, time);
	const bpos = new BodyPosition(observerBody, targetBody, aberration, observerPos);
	return CorrectLightTravel((t) => bpos.Position(t), time);
}
/**
* @brief Calculates a vector from the center of the Earth to the given body at the given time.
*
* Calculates geocentric (i.e., with respect to the center of the Earth)
* Cartesian coordinates in the J2000 equatorial system of a celestial
* body at a specified time. The position is always corrected for light travel time:
* this means the position of the body is "back-dated" based on how long it
* takes light to travel from the body to an observer on the Earth.
* Also, the position can optionally be corrected for aberration, an effect
* causing the apparent direction of the body to be shifted based on
* transverse movement of the Earth with respect to the rays of light
* coming from that body.
*
* @param {Body} body
*      One of the following values:
*      `Body.Sun`, `Body.Moon`, `Body.Mercury`, `Body.Venus`,
*      `Body.Earth`, `Body.Mars`, `Body.Jupiter`, `Body.Saturn`,
*      `Body.Uranus`, `Body.Neptune`, or `Body.Pluto`.
*      Also allowed to be a user-defined star created with {@link DefineStar}.
*
* @param {FlexibleDateTime} date
*      The date and time for which the body's position is to be calculated.
*
* @param {boolean} aberration
*      Pass `true` to correct for
*      <a href="https://en.wikipedia.org/wiki/Aberration_of_light">aberration</a>,
*      or `false` to leave uncorrected.
*
* @returns {Vector}
*/
function GeoVector(body, date, aberration) {
	VerifyBoolean(aberration);
	const time = MakeTime(date);
	switch (body) {
		case Body.Earth: return new Vector(0, 0, 0, time);
		case Body.Moon: return GeoMoon(time);
		default:
			const vec = BackdatePosition(time, Body.Earth, body, aberration);
			vec.t = time;
			return vec;
	}
}
function ExportState(terse, time) {
	return new StateVector(terse.r.x, terse.r.y, terse.r.z, terse.v.x, terse.v.y, terse.v.z, time);
}
/**
* @brief  Calculates heliocentric position and velocity vectors for the given body.
*
* Given a body and a time, calculates the position and velocity
* vectors for the center of that body at that time, relative to the center of the Sun.
* The vectors are expressed in J2000 mean equator coordinates (EQJ).
* If you need the position vector only, it is more efficient to call {@link HelioVector}.
* The Sun's center is a non-inertial frame of reference. In other words, the Sun
* experiences acceleration due to gravitational forces, mostly from the larger
* planets (Jupiter, Saturn, Uranus, and Neptune). If you want to calculate momentum,
* kinetic energy, or other quantities that require a non-accelerating frame
* of reference, consider using {@link BaryState} instead.
*
* @param {Body} body
*      The celestial body whose heliocentric state vector is to be calculated.
*      Supported values are `Body.Sun`, `Body.Moon`, `Body.EMB`, `Body.SSB`, and all planets:
*      `Body.Mercury`, `Body.Venus`, `Body.Earth`, `Body.Mars`, `Body.Jupiter`,
*      `Body.Saturn`, `Body.Uranus`, `Body.Neptune`, `Body.Pluto`.
*      Also allowed to be a user-defined star created by {@link DefineStar}.
*
*  @param {FlexibleDateTime} date
*      The date and time for which to calculate position and velocity.
*
*  @returns {StateVector}
*      An object that contains heliocentric position and velocity vectors.
*/
function HelioState(body, date) {
	const time = MakeTime(date);
	switch (body) {
		case Body.Sun: return new StateVector(0, 0, 0, 0, 0, 0, time);
		case Body.SSB:
			const bary = new major_bodies_t(time.tt);
			return new StateVector(-bary.Sun.r.x, -bary.Sun.r.y, -bary.Sun.r.z, -bary.Sun.v.x, -bary.Sun.v.y, -bary.Sun.v.z, time);
		case Body.Mercury:
		case Body.Venus:
		case Body.Earth:
		case Body.Mars:
		case Body.Jupiter:
		case Body.Saturn:
		case Body.Uranus:
		case Body.Neptune: return ExportState(CalcVsopPosVel(vsop[body], time.tt), time);
		case Body.Pluto: return CalcPluto(time, true);
		case Body.Moon:
		case Body.EMB:
			const earth = CalcVsopPosVel(vsop.Earth, time.tt);
			const state = body == Body.Moon ? GeoMoonState(time) : GeoEmbState(time);
			return new StateVector(state.x + earth.r.x, state.y + earth.r.y, state.z + earth.r.z, state.vx + earth.v.x, state.vy + earth.v.y, state.vz + earth.v.z, time);
		default:
			if (UserDefinedStar(body)) {
				const vec = HelioVector(body, time);
				return new StateVector(vec.x, vec.y, vec.z, 0, 0, 0, time);
			}
			throw `HelioState: Unsupported body "${body}"`;
	}
}
function QuadInterp(tm, dt, fa, fm, fb) {
	let Q = (fb + fa) / 2 - fm;
	let R = (fb - fa) / 2;
	let S = fm;
	let x;
	if (Q == 0) {
		if (R == 0) return null;
		x = -S / R;
		if (x < -1 || x > 1) return null;
	} else {
		let u = R * R - 4 * Q * S;
		if (u <= 0) return null;
		let ru = Math.sqrt(u);
		let x1 = (-R + ru) / (2 * Q);
		let x2 = (-R - ru) / (2 * Q);
		if (-1 <= x1 && x1 <= 1) {
			if (-1 <= x2 && x2 <= 1) return null;
			x = x1;
		} else if (-1 <= x2 && x2 <= 1) x = x2;
		else return null;
	}
	return {
		t: tm + x * dt,
		df_dt: (2 * Q * x + R) / dt
	};
}
/**
* @brief Options for the {@link Search} function.
*
* @typedef {object} SearchOptions
*
* @property {number | undefined} dt_tolerance_seconds
*      The number of seconds for a time window smaller than which the search
*      is considered successful.  Using too large a tolerance can result in
*      an inaccurate time estimate.  Using too small a tolerance can cause
*      excessive computation, or can even cause the search to fail because of
*      limited floating-point resolution.  Defaults to 1 second.
*
* @property {number | undefined} init_f1
*      As an optimization, if the caller of {@link Search}
*      has already calculated the value of the function being searched (the parameter `func`)
*      at the time coordinate `t1`, it can pass in that value as `init_f1`.
*      For very expensive calculations, this can measurably improve performance.
*
* @property {number | undefined} init_f2
*      The same as `init_f1`, except this is the optional initial value of `func(t2)`
*      instead of `func(t1)`.
*
* @property {number | undefined} iter_limit
*/
/**
* @brief Finds the time when a function ascends through zero.
*
* Search for next time <i>t</i> (such that <i>t</i> is between `t1` and `t2`)
* that `func(t)` crosses from a negative value to a non-negative value.
* The given function must have "smooth" behavior over the entire inclusive range [`t1`, `t2`],
* meaning that it behaves like a continuous differentiable function.
* It is not required that `t1` &lt; `t2`; `t1` &gt; `t2`
* allows searching backward in time.
* Note: `t1` and `t2` must be chosen such that there is no possibility
* of more than one zero-crossing (ascending or descending), or it is possible
* that the "wrong" event will be found (i.e. not the first event after t1)
* or even that the function will return `null`, indicating that no event was found.
*
* @param {function(AstroTime): number} func
*      The function to find an ascending zero crossing for.
*      The function must accept a single parameter of type {@link AstroTime}
*      and return a numeric value:
*      function({@link AstroTime}) =&gt; `number`
*
* @param {AstroTime} t1
*      The lower time bound of a search window.
*
* @param {AstroTime} t2
*      The upper time bound of a search window.
*
* @param {SearchOptions | undefined} options
*      Options that can tune the behavior of the search.
*      Most callers can omit this argument.
*
* @returns {AstroTime | null}
*      If the search is successful, returns the date and time of the solution.
*      If the search fails, returns `null`.
*/
function Search(f, t1, t2, options) {
	const dt_tolerance_seconds = VerifyNumber(options && options.dt_tolerance_seconds || 1);
	const dt_days = Math.abs(dt_tolerance_seconds / SECONDS_PER_DAY);
	let f1 = options && options.init_f1 || f(t1);
	let f2 = options && options.init_f2 || f(t2);
	let fmid = NaN;
	let iter = 0;
	let iter_limit = options && options.iter_limit || 20;
	let calc_fmid = true;
	while (true) {
		if (++iter > iter_limit) throw `Excessive iteration in Search()`;
		let tmid = InterpolateTime(t1, t2, .5);
		let dt = tmid.ut - t1.ut;
		if (Math.abs(dt) < dt_days) return tmid;
		if (calc_fmid) fmid = f(tmid);
		else calc_fmid = true;
		let q = QuadInterp(tmid.ut, t2.ut - tmid.ut, f1, fmid, f2);
		if (q) {
			let tq = MakeTime(q.t);
			let fq = f(tq);
			if (q.df_dt !== 0) {
				if (Math.abs(fq / q.df_dt) < dt_days) return tq;
				let dt_guess = 1.2 * Math.abs(fq / q.df_dt);
				if (dt_guess < dt / 10) {
					let tleft = tq.AddDays(-dt_guess);
					let tright = tq.AddDays(+dt_guess);
					if ((tleft.ut - t1.ut) * (tleft.ut - t2.ut) < 0) {
						if ((tright.ut - t1.ut) * (tright.ut - t2.ut) < 0) {
							let fleft = f(tleft);
							let fright = f(tright);
							if (fleft < 0 && fright >= 0) {
								f1 = fleft;
								f2 = fright;
								t1 = tleft;
								t2 = tright;
								fmid = fq;
								calc_fmid = false;
								continue;
							}
						}
					}
				}
			}
		}
		if (f1 < 0 && fmid >= 0) {
			t2 = tmid;
			f2 = fmid;
			continue;
		}
		if (fmid < 0 && f2 >= 0) {
			t1 = tmid;
			f1 = fmid;
			continue;
		}
		return null;
	}
}
function NormalizeLongitude(lon) {
	while (lon < 0) lon += 360;
	while (lon >= 360) lon -= 360;
	return lon;
}
/**
* @brief Returns one body's ecliptic longitude with respect to another, as seen from the Earth.
*
* This function determines where one body appears around the ecliptic plane
* (the plane of the Earth's orbit around the Sun) as seen from the Earth,
* relative to the another body's apparent position.
* The function returns an angle in the half-open range [0, 360) degrees.
* The value is the ecliptic longitude of `body1` relative to the ecliptic
* longitude of `body2`.
*
* The angle is 0 when the two bodies are at the same ecliptic longitude
* as seen from the Earth. The angle increases in the prograde direction
* (the direction that the planets orbit the Sun and the Moon orbits the Earth).
*
* When the angle is 180 degrees, it means the two bodies appear on opposite sides
* of the sky for an Earthly observer.
*
* Neither `body1` nor `body2` is allowed to be `Body.Earth`.
* If this happens, the function throws an exception.
*
* @param {Body} body1
*      The first body, whose longitude is to be found relative to the second body.
*
* @param {Body} body2
*      The second body, relative to which the longitude of the first body is to be found.
*
* @param {FlexibleDateTime} date
*      The date and time of the observation.
*
* @returns {number}
*      An angle in the range [0, 360), expressed in degrees.
*/
function PairLongitude(body1, body2, date) {
	if (body1 === Body.Earth || body2 === Body.Earth) throw "The Earth does not have a longitude as seen from itself.";
	const time = MakeTime(date);
	const eclip1 = Ecliptic(GeoVector(body1, time, false));
	const eclip2 = Ecliptic(GeoVector(body2, time, false));
	return NormalizeLongitude(eclip1.elon - eclip2.elon);
}
function VisualMagnitude(body, phase, helio_dist, geo_dist) {
	let c0, c1 = 0, c2 = 0, c3 = 0;
	switch (body) {
		case Body.Mercury:
			c0 = -.6;
			c1 = 4.98;
			c2 = -4.88;
			c3 = 3.02;
			break;
		case Body.Venus:
			if (phase < 163.6) {
				c0 = -4.47;
				c1 = 1.03;
				c2 = .57;
				c3 = .13;
			} else {
				c0 = .98;
				c1 = -1.02;
			}
			break;
		case Body.Mars:
			c0 = -1.52;
			c1 = 1.6;
			break;
		case Body.Jupiter:
			c0 = -9.4;
			c1 = .5;
			break;
		case Body.Uranus:
			c0 = -7.19;
			c1 = .25;
			break;
		case Body.Neptune:
			c0 = -6.87;
			break;
		case Body.Pluto:
			c0 = -1;
			c1 = 4;
			break;
		default: throw `VisualMagnitude: unsupported body ${body}`;
	}
	const x = phase / 100;
	let mag = c0 + x * (c1 + x * (c2 + x * c3));
	mag += 5 * Math.log10(helio_dist * geo_dist);
	return mag;
}
function SaturnMagnitude(phase, helio_dist, geo_dist, gc, time) {
	const eclip = Ecliptic(gc);
	const ir = DEG2RAD * 28.06;
	const Nr = DEG2RAD * (169.51 + 382e-7 * time.tt);
	const lat = DEG2RAD * eclip.elat;
	const lon = DEG2RAD * eclip.elon;
	const tilt = Math.asin(Math.sin(lat) * Math.cos(ir) - Math.cos(lat) * Math.sin(ir) * Math.sin(lon - Nr));
	const sin_tilt = Math.sin(Math.abs(tilt));
	let mag = -9 + .044 * phase;
	mag += sin_tilt * (-2.6 + 1.2 * sin_tilt);
	mag += 5 * Math.log10(helio_dist * geo_dist);
	return {
		mag,
		ring_tilt: RAD2DEG * tilt
	};
}
function MoonMagnitude(phase, helio_dist, geo_dist) {
	let rad = phase * DEG2RAD;
	let rad2 = rad * rad;
	let rad4 = rad2 * rad2;
	let mag = -12.717 + 1.49 * Math.abs(rad) + .0431 * rad4;
	let geo_au = geo_dist / (385000.6 / KM_PER_AU);
	mag += 5 * Math.log10(helio_dist * geo_au);
	return mag;
}
/**
* @brief Information about the apparent brightness and sunlit phase of a celestial object.
*
* @property {AstroTime} time
*      The date and time pertaining to the other calculated values in this object.
*
* @property {number} mag
*      The <a href="https://en.wikipedia.org/wiki/Apparent_magnitude">apparent visual magnitude</a> of the celestial body.
*
* @property {number} phase_angle
*      The angle in degrees as seen from the center of the celestial body between the Sun and the Earth.
*      The value is always in the range 0 to 180.
*      The phase angle provides a measure of what fraction of the body's face appears
*      illuminated by the Sun as seen from the Earth.
*      When the observed body is the Sun, the `phase` property is set to 0,
*      although this has no physical meaning because the Sun emits, rather than reflects, light.
*      When the phase is near 0 degrees, the body appears "full".
*      When it is 90 degrees, the body appears "half full".
*      And when it is 180 degrees, the body appears "new" and is very difficult to see
*      because it is both dim and lost in the Sun's glare as seen from the Earth.
*
* @property {number} phase_fraction
*      The fraction of the body's face that is illuminated by the Sun, as seen from the Earth.
*      Calculated from `phase_angle` for convenience.
*      This value ranges from 0 to 1.
*
* @property {number} helio_dist
*      The distance between the center of the Sun and the center of the body in
*      <a href="https://en.wikipedia.org/wiki/Astronomical_unit">astronomical units</a> (AU).
*
* @property {number} geo_dist
*      The distance between the center of the Earth and the center of the body in AU.
*
* @property {Vector} gc
*      Geocentric coordinates: the 3D vector from the center of the Earth to the center of the body.
*      The components are in expressed in AU and are oriented with respect to the J2000 equatorial plane.
*
* @property {Vector} hc
*      Heliocentric coordinates: The 3D vector from the center of the Sun to the center of the body.
*      Like `gc`, `hc` is expressed in AU and oriented with respect
*      to the J2000 equatorial plane.
*
* @property {number | undefined} ring_tilt
*      For Saturn, this is the angular tilt of the planet's rings in degrees away
*      from the line of sight from the Earth. When the value is near 0, the rings
*      appear edge-on from the Earth and are therefore difficult to see.
*      When `ring_tilt` approaches its maximum value (about 27 degrees),
*      the rings appear widest and brightest from the Earth.
*      Unlike the <a href="https://ssd.jpl.nasa.gov/horizons.cgi">JPL Horizons</a> online tool,
*      this library includes the effect of the ring tilt angle in the calculated value
*      for Saturn's visual magnitude.
*      For all bodies other than Saturn, the value of `ring_tilt` is `undefined`.
*/
var IlluminationInfo = class {
	constructor(time, mag, phase_angle, helio_dist, geo_dist, gc, hc, ring_tilt) {
		this.time = time;
		this.mag = mag;
		this.phase_angle = phase_angle;
		this.helio_dist = helio_dist;
		this.geo_dist = geo_dist;
		this.gc = gc;
		this.hc = hc;
		this.ring_tilt = ring_tilt;
		this.phase_fraction = (1 + Math.cos(DEG2RAD * phase_angle)) / 2;
	}
};
/**
* @brief Calculates visual magnitude and related information about a body.
*
* Calculates the phase angle, visual magnitude,
* and other values relating to the body's illumination
* at the given date and time, as seen from the Earth.
*
* @param {Body} body
*      The name of the celestial body being observed.
*      Not allowed to be `Body.Earth`.
*
* @param {FlexibleDateTime} date
*      The date and time for which to calculate the illumination data for the given body.
*
* @returns {IlluminationInfo}
*/
function Illumination(body, date) {
	if (body === Body.Earth) throw `The illumination of the Earth is not defined.`;
	const time = MakeTime(date);
	const earth = CalcVsop(vsop.Earth, time);
	let phase;
	let hc;
	let gc;
	let mag;
	if (body === Body.Sun) {
		gc = new Vector(-earth.x, -earth.y, -earth.z, time);
		hc = new Vector(0, 0, 0, time);
		phase = 0;
	} else {
		if (body === Body.Moon) {
			gc = GeoMoon(time);
			hc = new Vector(earth.x + gc.x, earth.y + gc.y, earth.z + gc.z, time);
		} else {
			hc = HelioVector(body, date);
			gc = new Vector(hc.x - earth.x, hc.y - earth.y, hc.z - earth.z, time);
		}
		phase = AngleBetween(gc, hc);
	}
	let geo_dist = gc.Length();
	let helio_dist = hc.Length();
	let ring_tilt;
	if (body === Body.Sun) mag = SUN_MAG_1AU + 5 * Math.log10(geo_dist);
	else if (body === Body.Moon) mag = MoonMagnitude(phase, helio_dist, geo_dist);
	else if (body === Body.Saturn) {
		const saturn = SaturnMagnitude(phase, helio_dist, geo_dist, gc, time);
		mag = saturn.mag;
		ring_tilt = saturn.ring_tilt;
	} else mag = VisualMagnitude(body, phase, helio_dist, geo_dist);
	return new IlluminationInfo(time, mag, phase, helio_dist, geo_dist, gc, hc, ring_tilt);
}
/**
* @brief Determines the moon's phase expressed as an ecliptic longitude.
*
* @param {FlexibleDateTime} date
*      The date and time for which to calculate the moon's phase.
*
* @returns {number}
*      A value in the range [0, 360) indicating the difference
*      in ecliptic longitude between the center of the Sun and the
*      center of the Moon, as seen from the center of the Earth.
*      Certain longitude values have conventional meanings:
*
* * 0 = new moon
* * 90 = first quarter
* * 180 = full moon
* * 270 = third quarter
*/
function MoonPhase(date) {
	return PairLongitude(Body.Moon, Body.Sun, date);
}
/**
* @brief Information about idealized atmospheric variables at a given elevation.
*
* @property {number} pressure
*      Atmospheric pressure in pascals.
*
* @property {number} temperature
*      Atmospheric temperature in kelvins.
*
* @property {number} density
*      Atmospheric density relative to sea level.
*/
var AtmosphereInfo = class {
	constructor(pressure, temperature, density) {
		this.pressure = pressure;
		this.temperature = temperature;
		this.density = density;
	}
};
/**
* @brief Calculates U.S. Standard Atmosphere (1976) variables as a function of elevation.
*
* This function calculates idealized values of pressure, temperature, and density
* using the U.S. Standard Atmosphere (1976) model.
* 1. COESA, U.S. Standard Atmosphere, 1976, U.S. Government Printing Office, Washington, DC, 1976.
* 2. Jursa, A. S., Ed., Handbook of Geophysics and the Space Environment, Air Force Geophysics Laboratory, 1985.
* See:
* https://hbcp.chemnetbase.com/faces/documents/14_12/14_12_0001.xhtml
* https://ntrs.nasa.gov/api/citations/19770009539/downloads/19770009539.pdf
* https://www.ngdc.noaa.gov/stp/space-weather/online-publications/miscellaneous/us-standard-atmosphere-1976/us-standard-atmosphere_st76-1562_noaa.pdf
*
* @param {number} elevationMeters
*      The elevation above sea level at which to calculate atmospheric variables.
*      Must be in the range -500 to +100000, or an exception will occur.
*
* @returns {AtmosphereInfo}
*/
function Atmosphere(elevationMeters) {
	const P0 = 101325;
	const T0 = 288.15;
	const T1 = 216.65;
	if (!Number.isFinite(elevationMeters) || elevationMeters < -500 || elevationMeters > 1e5) throw `Invalid elevation: ${elevationMeters}`;
	let temperature;
	let pressure;
	if (elevationMeters <= 11e3) {
		temperature = T0 - .0065 * elevationMeters;
		pressure = P0 * Math.pow(T0 / temperature, -5.25577);
	} else if (elevationMeters <= 2e4) {
		temperature = T1;
		pressure = 22632 * Math.exp(-.00015768832 * (elevationMeters - 11e3));
	} else {
		temperature = T1 + .001 * (elevationMeters - 2e4);
		pressure = 5474.87 * Math.pow(T1 / temperature, 34.16319);
	}
	const density = pressure / temperature / (P0 / T0);
	return new AtmosphereInfo(pressure, temperature, density);
}
function HorizonDipAngle(observer, metersAboveGround) {
	const phi = observer.latitude * DEG2RAD;
	const sinphi = Math.sin(phi);
	const cosphi = Math.cos(phi);
	const c = 1 / Math.hypot(cosphi, sinphi * EARTH_FLATTENING);
	const s = c * (EARTH_FLATTENING * EARTH_FLATTENING);
	const ht_km = (observer.height - metersAboveGround) / 1e3;
	const ach = EARTH_EQUATORIAL_RADIUS_KM * c + ht_km;
	const ash = EARTH_EQUATORIAL_RADIUS_KM * s + ht_km;
	const radius_m = 1e3 * Math.hypot(ach * cosphi, ash * sinphi);
	const k = .175 * Math.pow(1 - .0065 / 283.15 * (observer.height - 2 / 3 * metersAboveGround), 3.256);
	return RAD2DEG * -(Math.sqrt(2 * (1 - k) * metersAboveGround / radius_m) / (1 - k));
}
function BodyRadiusAu(body) {
	switch (body) {
		case Body.Sun: return SUN_RADIUS_AU;
		case Body.Moon: return MOON_EQUATORIAL_RADIUS_AU;
		default: return 0;
	}
}
/**
* @brief Searches for the next time a celestial body rises or sets as seen by an observer on the Earth.
*
* This function finds the next rise or set time of the Sun, Moon, or planet other than the Earth.
* Rise time is when the body first starts to be visible above the horizon.
* For example, sunrise is the moment that the top of the Sun first appears to peek above the horizon.
* Set time is the moment when the body appears to vanish below the horizon.
* Therefore, this function adjusts for the apparent angular radius of the observed body
* (significant only for the Sun and Moon).
*
* This function corrects for a typical value of atmospheric refraction, which causes celestial
* bodies to appear higher above the horizon than they would if the Earth had no atmosphere.
* Astronomy Engine uses a correction of 34 arcminutes. Real-world refraction varies based
* on air temperature, pressure, and humidity; such weather-based conditions are outside
* the scope of Astronomy Engine.
*
* Note that rise or set may not occur in every 24 hour period.
* For example, near the Earth's poles, there are long periods of time where
* the Sun stays below the horizon, never rising.
* Also, it is possible for the Moon to rise just before midnight but not set during the subsequent 24-hour day.
* This is because the Moon sets nearly an hour later each day due to orbiting the Earth a
* significant amount during each rotation of the Earth.
* Therefore callers must not assume that the function will always succeed.
*
* @param {Body} body
*      The Sun, Moon, any planet other than the Earth,
*      or a user-defined star that was created by a call to {@link DefineStar}.
*
* @param {Observer} observer
*      Specifies the geographic coordinates and elevation above sea level of the observer.
*
* @param {number} direction
*      Either +1 to find rise time or -1 to find set time.
*      Any other value will cause an exception to be thrown.
*
* @param {FlexibleDateTime} dateStart
*      The date and time after which the specified rise or set time is to be found.
*
* @param {number} limitDays
*      Limits how many days to search for a rise or set time, and defines
*      the direction in time to search. When `limitDays` is positive, the
*      search is performed into the future, after `dateStart`.
*      When negative, the search is performed into the past, before `dateStart`.
*      To limit a rise or set time to the same day, you can use a value of 1 day.
*      In cases where you want to find the next rise or set time no matter how far
*      in the future (for example, for an observer near the south pole), you can
*      pass in a larger value like 365.
*
* @param {number?} metersAboveGround
*      Defaults to 0.0 if omitted.
*      Usually the observer is located at ground level. Then this parameter
*      should be zero. But if the observer is significantly higher than ground
*      level, for example in an airplane, this parameter should be a positive
*      number indicating how far above the ground the observer is.
*      An exception occurs if `metersAboveGround` is negative.
*
* @returns {AstroTime | null}
*      The date and time of the rise or set event, or null if no such event
*      occurs within the specified time window.
*/
function SearchRiseSet(body, observer, direction, dateStart, limitDays, metersAboveGround = 0) {
	if (!Number.isFinite(metersAboveGround) || metersAboveGround < 0) throw `Invalid value for metersAboveGround: ${metersAboveGround}`;
	const body_radius_au = BodyRadiusAu(body);
	const atmos = Atmosphere(observer.height - metersAboveGround);
	return InternalSearchAltitude(body, observer, direction, dateStart, limitDays, body_radius_au, HorizonDipAngle(observer, metersAboveGround) - REFRACTION_NEAR_HORIZON * atmos.density);
}
var AscentInfo = class {
	constructor(tx, ty, ax, ay) {
		this.tx = tx;
		this.ty = ty;
		this.ax = ax;
		this.ay = ay;
	}
};
function FindAscent(depth, altdiff, max_deriv_alt, t1, t2, a1, a2) {
	if (a1 < 0 && a2 >= 0) return new AscentInfo(t1, t2, a1, a2);
	if (a1 >= 0 && a2 < 0) return null;
	if (depth > 17) throw `Excessive recursion in rise/set ascent search.`;
	const dt = t2.ut - t1.ut;
	if (dt * SECONDS_PER_DAY < 1) return null;
	if (Math.min(Math.abs(a1), Math.abs(a2)) > max_deriv_alt * (dt / 2)) return null;
	const tmid = new AstroTime((t1.ut + t2.ut) / 2);
	const amid = altdiff(tmid);
	return FindAscent(1 + depth, altdiff, max_deriv_alt, t1, tmid, a1, amid) || FindAscent(1 + depth, altdiff, max_deriv_alt, tmid, t2, amid, a2);
}
function MaxAltitudeSlope(body, latitude) {
	if (latitude < -90 || latitude > 90) throw `Invalid geographic latitude: ${latitude}`;
	let deriv_ra;
	let deriv_dec;
	switch (body) {
		case Body.Moon:
			deriv_ra = 4.5;
			deriv_dec = 8.2;
			break;
		case Body.Sun:
			deriv_ra = .8;
			deriv_dec = .5;
			break;
		case Body.Mercury:
			deriv_ra = -1.6;
			deriv_dec = 1;
			break;
		case Body.Venus:
			deriv_ra = -.8;
			deriv_dec = .6;
			break;
		case Body.Mars:
			deriv_ra = -.5;
			deriv_dec = .4;
			break;
		case Body.Jupiter:
		case Body.Saturn:
		case Body.Uranus:
		case Body.Neptune:
		case Body.Pluto:
			deriv_ra = -.2;
			deriv_dec = .2;
			break;
		case Body.Star1:
		case Body.Star2:
		case Body.Star3:
		case Body.Star4:
		case Body.Star5:
		case Body.Star6:
		case Body.Star7:
		case Body.Star8:
			deriv_ra = -.008;
			deriv_dec = .008;
			break;
		default: throw `Body not allowed for altitude search: ${body}`;
	}
	const latrad = DEG2RAD * latitude;
	return Math.abs((360 / SOLAR_DAYS_PER_SIDEREAL_DAY - deriv_ra) * Math.cos(latrad)) + Math.abs(deriv_dec * Math.sin(latrad));
}
function InternalSearchAltitude(body, observer, direction, dateStart, limitDays, bodyRadiusAu, targetAltitude) {
	VerifyObserver(observer);
	VerifyNumber(limitDays);
	VerifyNumber(bodyRadiusAu);
	VerifyNumber(targetAltitude);
	if (targetAltitude < -90 || targetAltitude > 90) throw `Invalid target altitude angle: ${targetAltitude}`;
	const max_deriv_alt = MaxAltitudeSlope(body, observer.latitude);
	function altdiff(time) {
		const ofdate = Equator(body, time, observer, true, true);
		return direction * (Horizon(time, observer, ofdate.ra, ofdate.dec).altitude + RAD2DEG * Math.asin(bodyRadiusAu / ofdate.dist) - targetAltitude);
	}
	const startTime = MakeTime(dateStart);
	let t1 = startTime;
	let t2 = startTime;
	let a1 = altdiff(t1);
	let a2 = a1;
	for (;;) {
		if (limitDays < 0) {
			t1 = t2.AddDays(-.42);
			a1 = altdiff(t1);
		} else {
			t2 = t1.AddDays(.42);
			a2 = altdiff(t2);
		}
		const ascent = FindAscent(0, altdiff, max_deriv_alt, t1, t2, a1, a2);
		if (ascent) {
			const time = Search(altdiff, ascent.tx, ascent.ty, {
				dt_tolerance_seconds: .1,
				init_f1: ascent.ax,
				init_f2: ascent.ay
			});
			if (time) {
				if (limitDays < 0) {
					if (time.ut < startTime.ut + limitDays) return null;
				} else if (time.ut > startTime.ut + limitDays) return null;
				return time;
			}
			throw `Rise/set search failed after finding ascent: t1=${t1}, t2=${t2}, a1=${a1}, a2=${a2}`;
		}
		if (limitDays < 0) {
			if (t1.ut < startTime.ut + limitDays) return null;
			t2 = t1;
			a2 = a1;
		} else {
			if (t2.ut > startTime.ut + limitDays) return null;
			t1 = t2;
			a1 = a2;
		}
	}
}
/**
* @brief The two kinds of apsis: pericenter (closest) and apocenter (farthest).
*
* `Pericenter`: The body is at its closest distance to the object it orbits.
* `Apocenter`:  The body is at its farthest distance from the object it orbits.
*
* @enum {number}
*/
var ApsisKind;
(function(ApsisKind) {
	ApsisKind[ApsisKind["Pericenter"] = 0] = "Pericenter";
	ApsisKind[ApsisKind["Apocenter"] = 1] = "Apocenter";
})(ApsisKind || (ApsisKind = {}));
/**
* @brief Converts spherical coordinates to Cartesian coordinates.
*
* Given spherical coordinates and a time at which they are valid,
* returns a vector of Cartesian coordinates. The returned value
* includes the time, as required by `AstroTime`.
*
* @param {Spherical} sphere
*      Spherical coordinates to be converted.
*
* @param {FlexibleDateTime} time
*      The time that should be included in the returned vector.
*
* @returns {Vector}
*      The vector form of the supplied spherical coordinates.
*/
function VectorFromSphere(sphere, time) {
	time = MakeTime(time);
	const radlat = sphere.lat * DEG2RAD;
	const radlon = sphere.lon * DEG2RAD;
	const rcoslat = sphere.dist * Math.cos(radlat);
	return new Vector(rcoslat * Math.cos(radlon), rcoslat * Math.sin(radlon), sphere.dist * Math.sin(radlat), time);
}
/**
* @brief Calculates the amount of "lift" to an altitude angle caused by atmospheric refraction.
*
* Given an altitude angle and a refraction option, calculates
* the amount of "lift" caused by atmospheric refraction.
* This is the number of degrees higher in the sky an object appears
* due to the lensing of the Earth's atmosphere.
* This function works best near sea level.
* To correct for higher elevations, call {@link Atmosphere} for that
* elevation and multiply the refraction angle by the resulting relative density.
*
* @param {string} refraction
*      `"normal"`: correct altitude for atmospheric refraction (recommended).
*      `"jplhor"`: for JPL Horizons compatibility testing only; not recommended for normal use.
*      `null`: no atmospheric refraction correction is performed.
*
* @param {number} altitude
*      An altitude angle in a horizontal coordinate system. Must be a value between -90 and +90.
*
* @returns {number}
*      The angular adjustment in degrees to be added to the altitude angle to correct for atmospheric lensing.
*/
function Refraction(refraction, altitude) {
	let refr;
	VerifyNumber(altitude);
	if (altitude < -90 || altitude > 90) return 0;
	if (refraction === "normal" || refraction === "jplhor") {
		let hd = altitude;
		if (hd < -1) hd = -1;
		refr = 1.02 / Math.tan((hd + 10.3 / (hd + 5.11)) * DEG2RAD) / 60;
		if (refraction === "normal" && altitude < -1) refr *= (altitude + 90) / 89;
	} else if (!refraction) refr = 0;
	else throw `Invalid refraction option: ${refraction}`;
	return refr;
}
/**
* @brief The different kinds of lunar/solar eclipses..
*
* `Penumbral`: A lunar eclipse in which only the Earth's penumbra falls on the Moon. (Never used for a solar eclipse.)
* `Partial`: A partial lunar/solar eclipse.
* `Annular`: A solar eclipse in which the entire Moon is visible against the Sun, but the Sun appears as a ring around the Moon. (Never used for a lunar eclipse.)
* `Total`: A total lunar/solar eclipse.
*
* @enum {string}
*/
var EclipseKind;
(function(EclipseKind) {
	EclipseKind["Penumbral"] = "penumbral";
	EclipseKind["Partial"] = "partial";
	EclipseKind["Annular"] = "annular";
	EclipseKind["Total"] = "total";
})(EclipseKind || (EclipseKind = {}));
/**
* @brief Indicates whether a crossing through the ecliptic plane is ascending or descending.
*
* `Invalid` is a placeholder for an unknown or missing node.
* `Ascending` indicates a body passing through the ecliptic plane from south to north.
* `Descending` indicates a body passing through the ecliptic plane from north to south.
*
* @enum {number}
*/
var NodeEventKind;
(function(NodeEventKind) {
	NodeEventKind[NodeEventKind["Invalid"] = 0] = "Invalid";
	NodeEventKind[NodeEventKind["Ascending"] = 1] = "Ascending";
	NodeEventKind[NodeEventKind["Descending"] = -1] = "Descending";
})(NodeEventKind || (NodeEventKind = {}));
// worker/lib/astro.ts
function phaseName$1(angleDeg) {
	const a = (angleDeg % 360 + 360) % 360;
	if (a < 22.5 || a >= 337.5) return "new moon";
	if (a < 67.5) return "waxing crescent";
	if (a < 112.5) return "first quarter";
	if (a < 157.5) return "waxing gibbous";
	if (a < 202.5) return "full moon";
	if (a < 247.5) return "waning gibbous";
	if (a < 292.5) return "last quarter";
	return "waning crescent";
}
function formatLocalClock(date, timeZone) {
	try {
		return new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
			timeZone
		}).format(date);
	} catch {
		return date.toISOString().slice(11, 16) + " UTC";
	}
}
/** Rough civil wall-time → UTC using the zone offset at that instant. */
function civilToUtc(year, month, day, hour, minute, timeZone) {
	const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
	try {
		const fmt = new Intl.DateTimeFormat("en-US", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23"
		});
		const bag = {};
		for (const p of fmt.formatToParts(new Date(utcGuess))) if (p.type !== "literal") bag[p.type] = p.value;
		const asIfUtc = Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day), Number(bag.hour), Number(bag.minute), Number(bag.second));
		return new Date(utcGuess - (asIfUtc - utcGuess));
	} catch {
		return new Date(utcGuess);
	}
}
function formatDaylightHours(hours) {
	const totalMins = Math.round(hours * 60);
	const h = Math.floor(totalMins / 60);
	const m = totalMins % 60;
	if (m === 0) return `${h}-hour`;
	return `${h}-hour ${m}-minute`;
}
/** Astronomical-ish season from calendar date + hemisphere (lat). */
function seasonFor(lat, month, day) {
	const md = month * 100 + day;
	let north;
	if (md >= 321 && md < 621) north = "spring";
	else if (md >= 621 && md < 922) north = "summer";
	else if (md >= 922 && md < 1221) north = "autumn";
	else north = "winter";
	if (lat >= 0) return north;
	return {
		spring: "autumn",
		summer: "winter",
		autumn: "spring",
		winter: "summer"
	}[north];
}
function daylightSeasonNote(opts) {
	const { daylightHours, season, lat } = opts;
	const hemi = lat >= 0 ? "north of the equator" : "south of the equator";
	const lengthWord = daylightHours >= 14 ? "long" : daylightHours <= 10 ? "short" : "balanced";
	const label = formatDaylightHours(daylightHours);
	if (lengthWord === "long") return `You arrived on a ${label} day — long ${season} light ${hemi}.`;
	if (lengthWord === "short") return `You arrived on a ${label} day — short ${season} light ${hemi}.`;
	return `You arrived on a ${label} day — near-balanced ${season} light ${hemi}.`;
}
function computeSky(opts) {
	const [y, m, d] = opts.date.split("-").map(Number);
	let hour = 12;
	let minute = 0;
	if (opts.time) {
		const [hh, mm] = opts.time.split(":").map(Number);
		if (!Number.isNaN(hh)) hour = hh;
		if (!Number.isNaN(mm)) minute = mm;
	}
	const tz = opts.timeZone || "UTC";
	const when = civilToUtc(y, m, d, hour, minute, tz);
	const observer = new Observer(opts.lat, opts.lon, 0);
	const phaseAngle = MoonPhase(when);
	const illum = Illumination(Body.Moon, when);
	let sunrise = null;
	let sunset = null;
	let daylightHours = null;
	let daylightLabel = null;
	const dayStart = civilToUtc(y, m, d, 0, 0, tz);
	try {
		const rise = SearchRiseSet(Body.Sun, observer, 1, dayStart, 1);
		const set = SearchRiseSet(Body.Sun, observer, -1, dayStart, 1.5);
		if (rise) sunrise = formatLocalClock(rise.date, tz);
		if (set) sunset = formatLocalClock(set.date, tz);
		if (rise && set && set.date.getTime() > rise.date.getTime()) {
			daylightHours = Math.round((set.date.getTime() - rise.date.getTime()) / 36e5 * 10) / 10;
			daylightLabel = formatDaylightHours(daylightHours);
		}
	} catch {}
	const season = seasonFor(opts.lat, m, d);
	const seasonNote = daylightHours != null ? daylightSeasonNote({
		daylightHours,
		season,
		lat: opts.lat
	}) : `You arrived in ${season} ${opts.lat >= 0 ? "north" : "south"} of the equator.`;
	return {
		moonPhase: phaseName$1(phaseAngle),
		illuminationPct: Math.round(illum.phase_fraction * 100),
		sunrise,
		sunset,
		daylightHours,
		daylightLabel,
		season,
		seasonNote
	};
}
// worker/data/billboard.json
var billboard_default = [
	{
		"date": "1958-08-04",
		"title": "Poor Little Fool",
		"artist": "Ricky Nelson"
	},
	{
		"date": "1964-02-01",
		"title": "I Want to Hold Your Hand",
		"artist": "The Beatles"
	},
	{
		"date": "1969-07-12",
		"title": "In the Year 2525",
		"artist": "Zager and Evans"
	},
	{
		"date": "1969-08-23",
		"title": "Honky Tonk Women",
		"artist": "The Rolling Stones"
	},
	{
		"date": "1977-08-20",
		"title": "Best of My Love",
		"artist": "The Emotions"
	},
	{
		"date": "1980-07-26",
		"title": "It's Still Rock and Roll to Me",
		"artist": "Billy Joel"
	},
	{
		"date": "1983-03-05",
		"title": "Billie Jean",
		"artist": "Michael Jackson"
	},
	{
		"date": "1985-07-13",
		"title": "A View to a Kill",
		"artist": "Duran Duran"
	},
	{
		"date": "1989-11-04",
		"title": "When I See You Smile",
		"artist": "Bad English"
	},
	{
		"date": "1990-08-04",
		"title": "Vision of Love",
		"artist": "Mariah Carey"
	},
	{
		"date": "1991-11-30",
		"title": "Black or White",
		"artist": "Michael Jackson"
	},
	{
		"date": "1992-08-08",
		"title": "This Used to Be My Playground",
		"artist": "Madonna"
	},
	{
		"date": "1993-08-07",
		"title": "Can't Help Falling in Love",
		"artist": "UB40"
	},
	{
		"date": "1994-09-10",
		"title": "I'll Make Love to You",
		"artist": "Boyz II Men"
	},
	{
		"date": "1995-06-10",
		"title": "Have You Ever Really Loved a Woman?",
		"artist": "Bryan Adams"
	},
	{
		"date": "1995-12-02",
		"title": "One Sweet Day",
		"artist": "Mariah Carey & Boyz II Men"
	},
	{
		"date": "1996-08-31",
		"title": "Macarena (Bayside Boys Mix)",
		"artist": "Los Del Rio"
	},
	{
		"date": "1997-01-18",
		"title": "Un-Break My Heart",
		"artist": "Toni Braxton"
	},
	{
		"date": "1997-06-14",
		"title": "I'll Be Missing You",
		"artist": "Puff Daddy featuring Faith Evans"
	},
	{
		"date": "1997-09-13",
		"title": "Honey",
		"artist": "Mariah Carey"
	},
	{
		"date": "1997-10-11",
		"title": "Four Seasons of Loneliness",
		"artist": "Boyz II Men"
	},
	{
		"date": "1997-10-25",
		"title": "Candle in the Wind 1997 / Something About the Way You Look Tonight",
		"artist": "Elton John"
	},
	{
		"date": "1998-02-28",
		"title": "My Heart Will Go On",
		"artist": "Celine Dion"
	},
	{
		"date": "1999-01-30",
		"title": "...Baby One More Time",
		"artist": "Britney Spears"
	},
	{
		"date": "2000-01-15",
		"title": "What a Girl Wants",
		"artist": "Christina Aguilera"
	},
	{
		"date": "2001-09-15",
		"title": "I'm Real",
		"artist": "Jennifer Lopez featuring Ja Rule"
	},
	{
		"date": "2002-05-18",
		"title": "Foolish",
		"artist": "Ashanti"
	},
	{
		"date": "2003-06-28",
		"title": "This Is the Night",
		"artist": "Clay Aiken"
	},
	{
		"date": "2004-07-10",
		"title": "Burn",
		"artist": "Usher"
	},
	{
		"date": "2005-07-02",
		"title": "We Belong Together",
		"artist": "Mariah Carey"
	},
	{
		"date": "2006-07-29",
		"title": "Crazy",
		"artist": "Gnarls Barkley"
	},
	{
		"date": "2007-04-07",
		"title": "Give It to Me",
		"artist": "Timbaland featuring Nelly Furtado & Justin Timberlake"
	},
	{
		"date": "2008-09-06",
		"title": "Whatever You Like",
		"artist": "T.I."
	},
	{
		"date": "2009-04-11",
		"title": "Boom Boom Pow",
		"artist": "The Black Eyed Peas"
	},
	{
		"date": "2010-01-02",
		"title": "Tik Tok",
		"artist": "Kesha"
	},
	{
		"date": "2011-03-12",
		"title": "Born This Way",
		"artist": "Lady Gaga"
	},
	{
		"date": "2012-09-01",
		"title": "We Are Never Ever Getting Back Together",
		"artist": "Taylor Swift"
	},
	{
		"date": "2013-06-22",
		"title": "Blurred Lines",
		"artist": "Robin Thicke featuring T.I. & Pharrell"
	},
	{
		"date": "2014-06-07",
		"title": "Fancy",
		"artist": "Iggy Azalea featuring Charli XCX"
	},
	{
		"date": "2015-08-29",
		"title": "Can't Feel My Face",
		"artist": "The Weeknd"
	},
	{
		"date": "2016-08-27",
		"title": "Closer",
		"artist": "The Chainsmokers featuring Halsey"
	},
	{
		"date": "2017-01-28",
		"title": "Shape of You",
		"artist": "Ed Sheeran"
	},
	{
		"date": "2017-10-28",
		"title": "Rockstar",
		"artist": "Post Malone featuring 21 Savage"
	},
	{
		"date": "2018-04-21",
		"title": "Nice for What",
		"artist": "Drake"
	},
	{
		"date": "2019-04-13",
		"title": "Old Town Road",
		"artist": "Lil Nas X featuring Billy Ray Cyrus"
	},
	{
		"date": "2020-04-04",
		"title": "Blinding Lights",
		"artist": "The Weeknd"
	},
	{
		"date": "2021-08-21",
		"title": "Stay",
		"artist": "The Kid Laroi & Justin Bieber"
	},
	{
		"date": "2022-10-29",
		"title": "Anti-Hero",
		"artist": "Taylor Swift"
	},
	{
		"date": "2023-07-01",
		"title": "Last Night",
		"artist": "Morgan Wallen"
	},
	{
		"date": "2024-02-03",
		"title": "Lovin on Me",
		"artist": "Jack Harlow"
	},
	{
		"date": "2025-01-04",
		"title": "Die With a Smile",
		"artist": "Lady Gaga & Bruno Mars"
	}
];
var births_population_default = {
	source: "UN World Population Prospects 2024 via Our World in Data",
	notes: "dailyBirths = annual live births / 365.25 (modeled average, not a civil register count)",
	coverage: {
		"minYear": 1950,
		"maxYear": 2023
	},
	byYear: {
		"1950": {
			"births": 91823940,
			"population": 2493092852,
			"dailyBirths": 251400
		},
		"1951": {
			"births": 92507130,
			"population": 2536927034,
			"dailyBirths": 253271
		},
		"1952": {
			"births": 97371460,
			"population": 2584086340,
			"dailyBirths": 266589
		},
		"1953": {
			"births": 97291460,
			"population": 2634106241,
			"dailyBirths": 266370
		},
		"1954": {
			"births": 100187860,
			"population": 2685894857,
			"dailyBirths": 274299
		},
		"1955": {
			"births": 101747970,
			"population": 2740213796,
			"dailyBirths": 278571
		},
		"1956": {
			"births": 101759016,
			"population": 2795409991,
			"dailyBirths": 278601
		},
		"1957": {
			"births": 106017736,
			"population": 2852618331,
			"dailyBirths": 290261
		},
		"1958": {
			"births": 104644160,
			"population": 2911249671,
			"dailyBirths": 286500
		},
		"1959": {
			"births": 101999840,
			"population": 2965950350,
			"dailyBirths": 279260
		},
		"1960": {
			"births": 102378080,
			"population": 3015470889,
			"dailyBirths": 280296
		},
		"1961": {
			"births": 100950940,
			"population": 3064869675,
			"dailyBirths": 276389
		},
		"1962": {
			"births": 112038710,
			"population": 3123374312,
			"dailyBirths": 306745
		},
		"1963": {
			"births": 119802890,
			"population": 3192807826,
			"dailyBirths": 328002
		},
		"1964": {
			"births": 117292200,
			"population": 3264487343,
			"dailyBirths": 321129
		},
		"1965": {
			"births": 117837010,
			"population": 3334533710,
			"dailyBirths": 322620
		},
		"1966": {
			"births": 117232950,
			"population": 3404041131,
			"dailyBirths": 320966
		},
		"1967": {
			"births": 116920264,
			"population": 3473412877,
			"dailyBirths": 320110
		},
		"1968": {
			"births": 121825890,
			"population": 3545187246,
			"dailyBirths": 333541
		},
		"1969": {
			"births": 122227970,
			"population": 3619491581,
			"dailyBirths": 334642
		},
		"1970": {
			"births": 124135900,
			"population": 3694683794,
			"dailyBirths": 339866
		},
		"1971": {
			"births": 123739680,
			"population": 3769847867,
			"dailyBirths": 338781
		},
		"1972": {
			"births": 123554020,
			"population": 3844917684,
			"dailyBirths": 338272
		},
		"1973": {
			"births": 123563930,
			"population": 3920805041,
			"dailyBirths": 338300
		},
		"1974": {
			"births": 122709410,
			"population": 3996416100,
			"dailyBirths": 335960
		},
		"1975": {
			"births": 121030100,
			"population": 4070735279,
			"dailyBirths": 331362
		},
		"1976": {
			"births": 121322350,
			"population": 4144246382,
			"dailyBirths": 332162
		},
		"1977": {
			"births": 120786520,
			"population": 4217863796,
			"dailyBirths": 330695
		},
		"1978": {
			"births": 122140650,
			"population": 4292097499,
			"dailyBirths": 334403
		},
		"1979": {
			"births": 125000296,
			"population": 4368539520,
			"dailyBirths": 342232
		},
		"1980": {
			"births": 127446984,
			"population": 4447606240,
			"dailyBirths": 348931
		},
		"1981": {
			"births": 129715840,
			"population": 4528777306,
			"dailyBirths": 355143
		},
		"1982": {
			"births": 133206504,
			"population": 4612673415,
			"dailyBirths": 364700
		},
		"1983": {
			"births": 131967710,
			"population": 4697327573,
			"dailyBirths": 361308
		},
		"1984": {
			"births": 134365260,
			"population": 4782175518,
			"dailyBirths": 367872
		},
		"1985": {
			"births": 136373950,
			"population": 4868943457,
			"dailyBirths": 373372
		},
		"1986": {
			"births": 139301170,
			"population": 4958072839,
			"dailyBirths": 381386
		},
		"1987": {
			"births": 141346560,
			"population": 5049746390,
			"dailyBirths": 386986
		},
		"1988": {
			"births": 140985950,
			"population": 5141992540,
			"dailyBirths": 385998
		},
		"1989": {
			"births": 142249020,
			"population": 5234431736,
			"dailyBirths": 389457
		},
		"1990": {
			"births": 143461420,
			"population": 5327803106,
			"dailyBirths": 392776
		},
		"1991": {
			"births": 138306860,
			"population": 5418735886,
			"dailyBirths": 378664
		},
		"1992": {
			"births": 136591250,
			"population": 5505989815,
			"dailyBirths": 373966
		},
		"1993": {
			"births": 135632140,
			"population": 5591544802,
			"dailyBirths": 371341
		},
		"1994": {
			"births": 135142910,
			"population": 5675551258,
			"dailyBirths": 370001
		},
		"1995": {
			"births": 134850050,
			"population": 5758878977,
			"dailyBirths": 369199
		},
		"1996": {
			"births": 134321020,
			"population": 5842055730,
			"dailyBirths": 367751
		},
		"1997": {
			"births": 133985670,
			"population": 5924787819,
			"dailyBirths": 366833
		},
		"1998": {
			"births": 133857530,
			"population": 6007066691,
			"dailyBirths": 366482
		},
		"1999": {
			"births": 134058670,
			"population": 6089006328,
			"dailyBirths": 367033
		},
		"2000": {
			"births": 135758480,
			"population": 6171702992,
			"dailyBirths": 371686
		},
		"2001": {
			"births": 13538e4,
			"population": 6254936464,
			"dailyBirths": 370650
		},
		"2002": {
			"births": 135396480,
			"population": 6337730343,
			"dailyBirths": 370695
		},
		"2003": {
			"births": 135700800,
			"population": 6420361633,
			"dailyBirths": 371529
		},
		"2004": {
			"births": 136596320,
			"population": 6503377774,
			"dailyBirths": 373980
		},
		"2005": {
			"births": 137166460,
			"population": 6586970132,
			"dailyBirths": 375541
		},
		"2006": {
			"births": 138469300,
			"population": 6671452019,
			"dailyBirths": 379108
		},
		"2007": {
			"births": 139935790,
			"population": 6757308776,
			"dailyBirths": 383123
		},
		"2008": {
			"births": 141758720,
			"population": 6844457659,
			"dailyBirths": 388114
		},
		"2009": {
			"births": 142968320,
			"population": 6932766416,
			"dailyBirths": 391426
		},
		"2010": {
			"births": 143354240,
			"population": 7021732143,
			"dailyBirths": 392483
		},
		"2011": {
			"births": 143878780,
			"population": 7110923773,
			"dailyBirths": 393919
		},
		"2012": {
			"births": 146054880,
			"population": 7201202478,
			"dailyBirths": 399876
		},
		"2013": {
			"births": 145014780,
			"population": 7291793585,
			"dailyBirths": 397029
		},
		"2014": {
			"births": 145268260,
			"population": 7381616239,
			"dailyBirths": 397723
		},
		"2015": {
			"births": 144333950,
			"population": 7470491876,
			"dailyBirths": 395165
		},
		"2016": {
			"births": 144854100,
			"population": 7558554527,
			"dailyBirths": 396589
		},
		"2017": {
			"births": 143601810,
			"population": 7645617952,
			"dailyBirths": 393160
		},
		"2018": {
			"births": 140332740,
			"population": 7729902779,
			"dailyBirths": 384210
		},
		"2019": {
			"births": 138596780,
			"population": 7811293699,
			"dailyBirths": 379457
		},
		"2020": {
			"births": 134719620,
			"population": 7887001289,
			"dailyBirths": 368842
		},
		"2021": {
			"births": 133448840,
			"population": 7954448387,
			"dailyBirths": 365363
		},
		"2022": {
			"births": 132475390,
			"population": 8021407196,
			"dailyBirths": 362698
		},
		"2023": {
			"births": 132110264,
			"population": 8091734933,
			"dailyBirths": 361698
		}
	}
};
var films_default = {
	source: "Box Office Mojo Domestic Yearly Box Office (#1 Release), 1977–2025; pre-1977 historical yearly leaders (estimated)",
	notes: "Calendar-year domestic #1 can differ from a film’s lifetime/release-year ranking (e.g. Titanic led 1998). Not a month-level chart.",
	coverage: {
		"minYear": 1950,
		"maxYear": 2025
	},
	byYear: {
		"1950": {
			"title": "Cinderella",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1951": {
			"title": "Quo Vadis",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1952": {
			"title": "The Greatest Show on Earth",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1953": {
			"title": "The Robe",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1954": {
			"title": "Rear Window",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1955": {
			"title": "Lady and the Tramp",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1956": {
			"title": "The Ten Commandments",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1957": {
			"title": "The Bridge on the River Kwai",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1958": {
			"title": "South Pacific",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1959": {
			"title": "Ben-Hur",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1960": {
			"title": "Swiss Family Robinson",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1961": {
			"title": "One Hundred and One Dalmatians",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1962": {
			"title": "Lawrence of Arabia",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1963": {
			"title": "Cleopatra",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1964": {
			"title": "Mary Poppins",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1965": {
			"title": "The Sound of Music",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1966": {
			"title": "Hawaii",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1967": {
			"title": "The Jungle Book",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1968": {
			"title": "Funny Girl",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1969": {
			"title": "Butch Cassidy and the Sundance Kid",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1970": {
			"title": "Love Story",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1971": {
			"title": "Fiddler on the Roof",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1972": {
			"title": "The Godfather",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1973": {
			"title": "The Exorcist",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1974": {
			"title": "Blazing Saddles",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1975": {
			"title": "Jaws",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1976": {
			"title": "Rocky",
			"market": "US domestic",
			"metric": "estimated yearly leader",
			"estimated": true
		},
		"1977": {
			"title": "Star Wars: Episode IV - A New Hope",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1978": {
			"title": "Grease",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1979": {
			"title": "Superman",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1980": {
			"title": "Star Wars: Episode V - The Empire Strikes Back",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1981": {
			"title": "Superman II",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1982": {
			"title": "E.T. the Extra-Terrestrial",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1983": {
			"title": "Star Wars: Episode VI - Return of the Jedi",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1984": {
			"title": "Ghostbusters",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1985": {
			"title": "Back to the Future",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1986": {
			"title": "Top Gun",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1987": {
			"title": "Beverly Hills Cop II",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1988": {
			"title": "Who Framed Roger Rabbit",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1989": {
			"title": "Batman",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1990": {
			"title": "Ghost",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1991": {
			"title": "Terminator 2: Judgment Day",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1992": {
			"title": "Batman Returns",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1993": {
			"title": "Jurassic Park",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1994": {
			"title": "The Lion King",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1995": {
			"title": "Batman Forever",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1996": {
			"title": "Independence Day",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1997": {
			"title": "Men in Black",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1998": {
			"title": "Titanic",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"1999": {
			"title": "Star Wars: Episode I - The Phantom Menace",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2000": {
			"title": "How the Grinch Stole Christmas",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2001": {
			"title": "Harry Potter and the Philosopher's Stone",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2002": {
			"title": "Spider-Man",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2003": {
			"title": "Finding Nemo",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2004": {
			"title": "Shrek 2",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2005": {
			"title": "Star Wars: Episode III - Revenge of the Sith",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2006": {
			"title": "Pirates of the Caribbean: Dead Man's Chest",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2007": {
			"title": "Spider-Man 3",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2008": {
			"title": "The Dark Knight",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2009": {
			"title": "Transformers: Revenge of the Fallen",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2010": {
			"title": "Avatar",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2011": {
			"title": "Harry Potter and the Deathly Hallows: Part 2",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2012": {
			"title": "The Avengers",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2013": {
			"title": "Iron Man 3",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2014": {
			"title": "Guardians of the Galaxy",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2015": {
			"title": "Jurassic World",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2016": {
			"title": "Finding Dory",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2017": {
			"title": "Star Wars: Episode VIII - The Last Jedi",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2018": {
			"title": "Black Panther",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2019": {
			"title": "Avengers: Endgame",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2020": {
			"title": "Bad Boys for Life",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2021": {
			"title": "Spider-Man: No Way Home",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2022": {
			"title": "Top Gun: Maverick",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2023": {
			"title": "Barbie",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2024": {
			"title": "Inside Out 2",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		},
		"2025": {
			"title": "A Minecraft Movie",
			"market": "US & Canada",
			"metric": "calendar-year domestic box-office #1",
			"estimated": false
		}
	}
};
var leaders_default = {
	source: "National leadership mid-year (1 July) snapshots: Wikidata office holders (P39) where complete, supplemented with curated historical lists for additional countries",
	notes: "Usually listed as — transitions, acting leaders, dual executives, martial-law eras, and disputed authorities may differ. A keepsake reconstruction, not an official register.",
	coverage: {
		"minYear": 1950,
		"maxYear": 2025
	},
	aliases: {
		"united states": "United States",
		"united kingdom": "United Kingdom",
		"canada": "Canada",
		"france": "France",
		"china": "China",
		"brazil": "Brazil",
		"mexico": "Mexico",
		"russia": "Russia",
		"indonesia": "Indonesia",
		"turkey": "Turkey",
		"netherlands": "Netherlands",
		"new zealand": "New Zealand",
		"united arab emirates": "United Arab Emirates",
		"norway": "Norway",
		"denmark": "Denmark",
		"hong kong": "Hong Kong",
		"taiwan": "Taiwan",
		"india": "India",
		"pakistan": "Pakistan",
		"australia": "Australia",
		"germany": "Germany",
		"japan": "Japan",
		"italy": "Italy",
		"spain": "Spain",
		"south korea": "South Korea",
		"israel": "Israel",
		"ireland": "Ireland",
		"sweden": "Sweden",
		"bangladesh": "Bangladesh",
		"south africa": "South Africa",
		"egypt": "Egypt",
		"saudi arabia": "Saudi Arabia",
		"philippines": "Philippines",
		"usa": "United States",
		"us": "United States",
		"u.s.": "United States",
		"u.s.a.": "United States",
		"united states of america": "United States",
		"uk": "United Kingdom",
		"great britain": "United Kingdom",
		"britain": "United Kingdom",
		"england": "United Kingdom",
		"people's republic of china": "China",
		"prc": "China",
		"russian federation": "Russia",
		"republic of korea": "South Korea",
		"korea, republic of": "South Korea",
		"uae": "United Arab Emirates",
		"hong kong sar china": "Hong Kong",
		"republic of china": "Taiwan",
		"türkiye": "Turkey",
		"turkiye": "Turkey"
	},
	byCountry: /* @__PURE__ */ JSON.parse("{\"United States\":{\"1950\":{\"name\":\"Harry S. Truman\",\"title\":\"President\"},\"1951\":{\"name\":\"Harry S. Truman\",\"title\":\"President\"},\"1952\":{\"name\":\"Harry S. Truman\",\"title\":\"President\"},\"1953\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1954\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1955\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1956\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1957\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1958\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1959\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1960\":{\"name\":\"Dwight D. Eisenhower\",\"title\":\"President\"},\"1961\":{\"name\":\"John F. Kennedy\",\"title\":\"President\"},\"1962\":{\"name\":\"John F. Kennedy\",\"title\":\"President\"},\"1963\":{\"name\":\"John F. Kennedy\",\"title\":\"President\"},\"1964\":{\"name\":\"Lyndon B. Johnson\",\"title\":\"President\"},\"1965\":{\"name\":\"Lyndon B. Johnson\",\"title\":\"President\"},\"1966\":{\"name\":\"Lyndon B. Johnson\",\"title\":\"President\"},\"1967\":{\"name\":\"Lyndon B. Johnson\",\"title\":\"President\"},\"1968\":{\"name\":\"Lyndon B. Johnson\",\"title\":\"President\"},\"1969\":{\"name\":\"Richard Nixon\",\"title\":\"President\"},\"1970\":{\"name\":\"Richard Nixon\",\"title\":\"President\"},\"1971\":{\"name\":\"Richard Nixon\",\"title\":\"President\"},\"1972\":{\"name\":\"Richard Nixon\",\"title\":\"President\"},\"1973\":{\"name\":\"Richard Nixon\",\"title\":\"President\"},\"1974\":{\"name\":\"Richard Nixon\",\"title\":\"President\"},\"1975\":{\"name\":\"Gerald Ford\",\"title\":\"President\"},\"1976\":{\"name\":\"Gerald Ford\",\"title\":\"President\"},\"1977\":{\"name\":\"Jimmy Carter\",\"title\":\"President\"},\"1978\":{\"name\":\"Jimmy Carter\",\"title\":\"President\"},\"1979\":{\"name\":\"Jimmy Carter\",\"title\":\"President\"},\"1980\":{\"name\":\"Jimmy Carter\",\"title\":\"President\"},\"1981\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1982\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1983\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1984\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1985\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1986\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1987\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1988\":{\"name\":\"Ronald Reagan\",\"title\":\"President\"},\"1989\":{\"name\":\"George H. W. Bush\",\"title\":\"President\"},\"1990\":{\"name\":\"George H. W. Bush\",\"title\":\"President\"},\"1991\":{\"name\":\"George H. W. Bush\",\"title\":\"President\"},\"1992\":{\"name\":\"George H. W. Bush\",\"title\":\"President\"},\"1993\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"1994\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"1995\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"1996\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"1997\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"1998\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"1999\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"2000\":{\"name\":\"Bill Clinton\",\"title\":\"President\"},\"2001\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2002\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2003\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2004\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2005\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2006\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2007\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2008\":{\"name\":\"George W. Bush\",\"title\":\"President\"},\"2009\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2010\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2011\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2012\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2013\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2014\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2015\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2016\":{\"name\":\"Barack Obama\",\"title\":\"President\"},\"2017\":{\"name\":\"Donald Trump\",\"title\":\"President\"},\"2018\":{\"name\":\"Donald Trump\",\"title\":\"President\"},\"2019\":{\"name\":\"Phil Baker\",\"title\":\"President\"},\"2020\":{\"name\":\"Phil Baker\",\"title\":\"President\"},\"2021\":{\"name\":\"Phil Baker\",\"title\":\"President\"},\"2022\":{\"name\":\"Phil Baker\",\"title\":\"President\"},\"2023\":{\"name\":\"Phil Baker\",\"title\":\"President\"},\"2024\":{\"name\":\"Phil Baker\",\"title\":\"President\"},\"2025\":{\"name\":\"Phil Baker\",\"title\":\"President\"}},\"United Kingdom\":{\"1950\":{\"name\":\"Clement Attlee\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Clement Attlee\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Winston Churchill\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Winston Churchill\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Winston Churchill\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Anthony Eden\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Anthony Eden\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Harold Macmillan\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Harold Macmillan\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Harold Macmillan\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Harold Macmillan\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Harold Macmillan\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Harold Macmillan\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Harold Macmillan\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Alec Douglas-Home\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Harold Wilson\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Harold Wilson\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Harold Wilson\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Harold Wilson\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Harold Wilson\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Edward Heath\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Edward Heath\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Edward Heath\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Edward Heath\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Harold Wilson\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Harold Wilson\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"James Callaghan\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"James Callaghan\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"James Callaghan\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Margaret Thatcher\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"John Major\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"John Major\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"John Major\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"John Major\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"John Major\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"John Major\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Tony Blair\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Tony Blair\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Tony Blair\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Tony Blair\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Tony Blair\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Tony Blair\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"David\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"David\",\"title\":\"Prime Minister\"}},\"Canada\":{\"1950\":{\"name\":\"Louis St. Laurent\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Louis St. Laurent\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Louis St. Laurent\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Louis St. Laurent\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Louis St. Laurent\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Louis St. Laurent\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Louis St. Laurent\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"John Diefenbaker\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"John Diefenbaker\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"John Diefenbaker\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"John Diefenbaker\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"John Diefenbaker\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"John Diefenbaker\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Lester B. Pearson\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Lester B. Pearson\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Lester B. Pearson\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Lester B. Pearson\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Lester B. Pearson\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Joe Clark\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Pierre Trudeau\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"John Turner\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Brian Mulroney\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Kim Campbell\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Jean Chrétien\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Paul Martin\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Paul Martin\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Stephen Harper\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Justin Trudeau\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Mark Carney\",\"title\":\"Prime Minister\"}},\"France\":{\"1950\":{\"name\":\"Vincent Auriol\",\"title\":\"President\"},\"1951\":{\"name\":\"Vincent Auriol\",\"title\":\"President\"},\"1952\":{\"name\":\"Vincent Auriol\",\"title\":\"President\"},\"1953\":{\"name\":\"Vincent Auriol\",\"title\":\"President\"},\"1954\":{\"name\":\"René Coty\",\"title\":\"President\"},\"1955\":{\"name\":\"René Coty\",\"title\":\"President\"},\"1956\":{\"name\":\"René Coty\",\"title\":\"President\"},\"1957\":{\"name\":\"René Coty\",\"title\":\"President\"},\"1958\":{\"name\":\"René Coty\",\"title\":\"President\"},\"1959\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1960\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1961\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1962\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1963\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1964\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1965\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1966\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1967\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1968\":{\"name\":\"Charles de Gaulle\",\"title\":\"President\"},\"1969\":{\"name\":\"Georges Pompidou\",\"title\":\"President\"},\"1970\":{\"name\":\"Georges Pompidou\",\"title\":\"President\"},\"1971\":{\"name\":\"Georges Pompidou\",\"title\":\"President\"},\"1972\":{\"name\":\"Georges Pompidou\",\"title\":\"President\"},\"1973\":{\"name\":\"Georges Pompidou\",\"title\":\"President\"},\"1974\":{\"name\":\"Valéry Giscard d'Estaing\",\"title\":\"President\"},\"1975\":{\"name\":\"Valéry Giscard d'Estaing\",\"title\":\"President\"},\"1976\":{\"name\":\"Valéry Giscard d'Estaing\",\"title\":\"President\"},\"1977\":{\"name\":\"Valéry Giscard d'Estaing\",\"title\":\"President\"},\"1978\":{\"name\":\"Valéry Giscard d'Estaing\",\"title\":\"President\"},\"1979\":{\"name\":\"Valéry Giscard d'Estaing\",\"title\":\"President\"},\"1980\":{\"name\":\"Valéry Giscard d'Estaing\",\"title\":\"President\"},\"1981\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1982\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1983\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1984\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1985\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1986\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1987\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1988\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1989\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1990\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1991\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1992\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1993\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1994\":{\"name\":\"François Mitterrand\",\"title\":\"President\"},\"1995\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"1996\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"1997\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"1998\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"1999\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2000\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2001\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2002\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2003\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2004\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2005\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2006\":{\"name\":\"Jacques Chirac\",\"title\":\"President\"},\"2007\":{\"name\":\"Nicolas Sarkozy\",\"title\":\"President\"},\"2008\":{\"name\":\"Nicolas Sarkozy\",\"title\":\"President\"},\"2009\":{\"name\":\"Nicolas Sarkozy\",\"title\":\"President\"},\"2010\":{\"name\":\"Nicolas Sarkozy\",\"title\":\"President\"},\"2011\":{\"name\":\"Nicolas Sarkozy\",\"title\":\"President\"},\"2012\":{\"name\":\"François Hollande\",\"title\":\"President\"},\"2013\":{\"name\":\"François Hollande\",\"title\":\"President\"},\"2014\":{\"name\":\"François Hollande\",\"title\":\"President\"},\"2015\":{\"name\":\"François Hollande\",\"title\":\"President\"},\"2016\":{\"name\":\"François Hollande\",\"title\":\"President\"},\"2017\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2018\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2019\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2020\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2021\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2022\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2023\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2024\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"},\"2025\":{\"name\":\"Emmanuel Macron\",\"title\":\"President\"}},\"China\":{\"1955\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1956\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1957\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1958\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1959\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1960\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1961\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1962\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1963\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1964\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1965\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1966\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1967\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1968\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1969\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1970\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1971\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1972\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1973\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1974\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1975\":{\"name\":\"Zhou Enlai\",\"title\":\"Premier\"},\"1976\":{\"name\":\"Hua Guofeng\",\"title\":\"Premier\"},\"1977\":{\"name\":\"Hua Guofeng\",\"title\":\"Premier\"},\"1978\":{\"name\":\"Hua Guofeng\",\"title\":\"Premier\"},\"1979\":{\"name\":\"Hua Guofeng\",\"title\":\"Premier\"},\"1980\":{\"name\":\"Hua Guofeng\",\"title\":\"Premier\"},\"1988\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1989\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1990\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1991\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1992\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1993\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1994\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1995\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1996\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1997\":{\"name\":\"Li Peng\",\"title\":\"Premier\"},\"1998\":{\"name\":\"Zhu Rongji\",\"title\":\"Premier\"},\"1999\":{\"name\":\"Zhu Rongji\",\"title\":\"Premier\"},\"2000\":{\"name\":\"Zhu Rongji\",\"title\":\"Premier\"},\"2001\":{\"name\":\"Zhu Rongji\",\"title\":\"Premier\"},\"2002\":{\"name\":\"Zhu Rongji\",\"title\":\"Premier\"},\"2003\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2004\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2005\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2006\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2007\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2008\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2009\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2010\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2011\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2012\":{\"name\":\"Wen Jiabao\",\"title\":\"Premier\"},\"2013\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2014\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2015\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2016\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2017\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2018\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2019\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2020\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2021\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2022\":{\"name\":\"Li Keqiang\",\"title\":\"Premier\"},\"2023\":{\"name\":\"Li Qiang\",\"title\":\"Premier\"},\"2024\":{\"name\":\"Li Qiang\",\"title\":\"Premier\"},\"2025\":{\"name\":\"Li Qiang\",\"title\":\"Premier\"}},\"Brazil\":{\"1950\":{\"name\":\"Eurico Gaspar Dutra\",\"title\":\"President\"},\"1951\":{\"name\":\"Getúlio Vargas\",\"title\":\"President\"},\"1952\":{\"name\":\"Getúlio Vargas\",\"title\":\"President\"},\"1953\":{\"name\":\"Getúlio Vargas\",\"title\":\"President\"},\"1954\":{\"name\":\"Getúlio Vargas\",\"title\":\"President\"},\"1955\":{\"name\":\"Café Filho\",\"title\":\"President\"},\"1956\":{\"name\":\"Juscelino Kubitschek\",\"title\":\"President\"},\"1957\":{\"name\":\"Juscelino Kubitschek\",\"title\":\"President\"},\"1958\":{\"name\":\"Juscelino Kubitschek\",\"title\":\"President\"},\"1959\":{\"name\":\"Juscelino Kubitschek\",\"title\":\"President\"},\"1960\":{\"name\":\"Juscelino Kubitschek\",\"title\":\"President\"},\"1961\":{\"name\":\"Jânio Quadros\",\"title\":\"President\"},\"1962\":{\"name\":\"João Goulart\",\"title\":\"President\"},\"1963\":{\"name\":\"João Goulart\",\"title\":\"President\"},\"1964\":{\"name\":\"Humberto Castelo Branco\",\"title\":\"President\"},\"1965\":{\"name\":\"Humberto Castelo Branco\",\"title\":\"President\"},\"1966\":{\"name\":\"Humberto Castelo Branco\",\"title\":\"President\"},\"1967\":{\"name\":\"Artur da Costa e Silva\",\"title\":\"President\"},\"1968\":{\"name\":\"Artur da Costa e Silva\",\"title\":\"President\"},\"1969\":{\"name\":\"Artur da Costa e Silva\",\"title\":\"President\"},\"1970\":{\"name\":\"Emílio Garrastazu Médici\",\"title\":\"President\"},\"1971\":{\"name\":\"Emílio Garrastazu Médici\",\"title\":\"President\"},\"1972\":{\"name\":\"Emílio Garrastazu Médici\",\"title\":\"President\"},\"1973\":{\"name\":\"Emílio Garrastazu Médici\",\"title\":\"President\"},\"1974\":{\"name\":\"Ernesto Geisel\",\"title\":\"President\"},\"1975\":{\"name\":\"Ernesto Geisel\",\"title\":\"President\"},\"1976\":{\"name\":\"Ernesto Geisel\",\"title\":\"President\"},\"1977\":{\"name\":\"Ernesto Geisel\",\"title\":\"President\"},\"1978\":{\"name\":\"Ernesto Geisel\",\"title\":\"President\"},\"1979\":{\"name\":\"João Figueiredo\",\"title\":\"President\"},\"1980\":{\"name\":\"João Figueiredo\",\"title\":\"President\"},\"1981\":{\"name\":\"João Figueiredo\",\"title\":\"President\"},\"1982\":{\"name\":\"João Figueiredo\",\"title\":\"President\"},\"1983\":{\"name\":\"João Figueiredo\",\"title\":\"President\"},\"1984\":{\"name\":\"João Figueiredo\",\"title\":\"President\"},\"1985\":{\"name\":\"José Sarney\",\"title\":\"President\"},\"1986\":{\"name\":\"José Sarney\",\"title\":\"President\"},\"1987\":{\"name\":\"José Sarney\",\"title\":\"President\"},\"1988\":{\"name\":\"José Sarney\",\"title\":\"President\"},\"1989\":{\"name\":\"José Sarney\",\"title\":\"President\"},\"1990\":{\"name\":\"Fernando Collor\",\"title\":\"President\"},\"1991\":{\"name\":\"Fernando Collor\",\"title\":\"President\"},\"1992\":{\"name\":\"Fernando Collor\",\"title\":\"President\"},\"1993\":{\"name\":\"Itamar Franco\",\"title\":\"President\"},\"1994\":{\"name\":\"Itamar Franco\",\"title\":\"President\"},\"1995\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"1996\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"1997\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"1998\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"1999\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"2000\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"2001\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"2002\":{\"name\":\"Fernando Henrique Cardoso\",\"title\":\"President\"},\"2003\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2004\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2005\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2006\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2007\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2008\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2009\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2010\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2011\":{\"name\":\"Dilma Rousseff\",\"title\":\"President\"},\"2012\":{\"name\":\"Dilma Rousseff\",\"title\":\"President\"},\"2013\":{\"name\":\"Dilma Rousseff\",\"title\":\"President\"},\"2014\":{\"name\":\"Dilma Rousseff\",\"title\":\"President\"},\"2015\":{\"name\":\"Dilma Rousseff\",\"title\":\"President\"},\"2016\":{\"name\":\"Dilma Rousseff\",\"title\":\"President\"},\"2017\":{\"name\":\"Michel Temer\",\"title\":\"President\"},\"2018\":{\"name\":\"Michel Temer\",\"title\":\"President\"},\"2019\":{\"name\":\"Jair Bolsonaro\",\"title\":\"President\"},\"2020\":{\"name\":\"Jair Bolsonaro\",\"title\":\"President\"},\"2021\":{\"name\":\"Jair Bolsonaro\",\"title\":\"President\"},\"2022\":{\"name\":\"Jair Bolsonaro\",\"title\":\"President\"},\"2023\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2024\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"},\"2025\":{\"name\":\"Luiz Inácio Lula da Silva\",\"title\":\"President\"}},\"Mexico\":{\"1950\":{\"name\":\"Miguel Alemán Valdés\",\"title\":\"President\"},\"1951\":{\"name\":\"Miguel Alemán Valdés\",\"title\":\"President\"},\"1952\":{\"name\":\"Adolfo Ruiz Cortines\",\"title\":\"President\"},\"1953\":{\"name\":\"Adolfo Ruiz Cortines\",\"title\":\"President\"},\"1954\":{\"name\":\"Adolfo Ruiz Cortines\",\"title\":\"President\"},\"1955\":{\"name\":\"Adolfo Ruiz Cortines\",\"title\":\"President\"},\"1956\":{\"name\":\"Adolfo Ruiz Cortines\",\"title\":\"President\"},\"1957\":{\"name\":\"Adolfo Ruiz Cortines\",\"title\":\"President\"},\"1958\":{\"name\":\"Adolfo López Mateos\",\"title\":\"President\"},\"1959\":{\"name\":\"Adolfo López Mateos\",\"title\":\"President\"},\"1960\":{\"name\":\"Adolfo López Mateos\",\"title\":\"President\"},\"1961\":{\"name\":\"Adolfo López Mateos\",\"title\":\"President\"},\"1962\":{\"name\":\"Adolfo López Mateos\",\"title\":\"President\"},\"1963\":{\"name\":\"Adolfo López Mateos\",\"title\":\"President\"},\"1964\":{\"name\":\"Gustavo Díaz Ordaz\",\"title\":\"President\"},\"1965\":{\"name\":\"Gustavo Díaz Ordaz\",\"title\":\"President\"},\"1966\":{\"name\":\"Gustavo Díaz Ordaz\",\"title\":\"President\"},\"1967\":{\"name\":\"Gustavo Díaz Ordaz\",\"title\":\"President\"},\"1968\":{\"name\":\"Gustavo Díaz Ordaz\",\"title\":\"President\"},\"1969\":{\"name\":\"Gustavo Díaz Ordaz\",\"title\":\"President\"},\"1970\":{\"name\":\"Luis Echeverría\",\"title\":\"President\"},\"1971\":{\"name\":\"Luis Echeverría\",\"title\":\"President\"},\"1972\":{\"name\":\"Luis Echeverría\",\"title\":\"President\"},\"1973\":{\"name\":\"Luis Echeverría\",\"title\":\"President\"},\"1974\":{\"name\":\"Luis Echeverría\",\"title\":\"President\"},\"1975\":{\"name\":\"Luis Echeverría\",\"title\":\"President\"},\"1976\":{\"name\":\"José López Portillo\",\"title\":\"President\"},\"1977\":{\"name\":\"José López Portillo\",\"title\":\"President\"},\"1978\":{\"name\":\"José López Portillo\",\"title\":\"President\"},\"1979\":{\"name\":\"José López Portillo\",\"title\":\"President\"},\"1980\":{\"name\":\"José López Portillo\",\"title\":\"President\"},\"1981\":{\"name\":\"José López Portillo\",\"title\":\"President\"},\"1982\":{\"name\":\"Miguel de la Madrid\",\"title\":\"President\"},\"1983\":{\"name\":\"Miguel de la Madrid\",\"title\":\"President\"},\"1984\":{\"name\":\"Miguel de la Madrid\",\"title\":\"President\"},\"1985\":{\"name\":\"Miguel de la Madrid\",\"title\":\"President\"},\"1986\":{\"name\":\"Miguel de la Madrid\",\"title\":\"President\"},\"1987\":{\"name\":\"Miguel de la Madrid\",\"title\":\"President\"},\"1988\":{\"name\":\"Carlos Salinas de Gortari\",\"title\":\"President\"},\"1989\":{\"name\":\"Carlos Salinas de Gortari\",\"title\":\"President\"},\"1990\":{\"name\":\"Carlos Salinas de Gortari\",\"title\":\"President\"},\"1991\":{\"name\":\"Carlos Salinas de Gortari\",\"title\":\"President\"},\"1992\":{\"name\":\"Carlos Salinas de Gortari\",\"title\":\"President\"},\"1993\":{\"name\":\"Carlos Salinas de Gortari\",\"title\":\"President\"},\"1994\":{\"name\":\"Ernesto Zedillo\",\"title\":\"President\"},\"1995\":{\"name\":\"Ernesto Zedillo\",\"title\":\"President\"},\"1996\":{\"name\":\"Ernesto Zedillo\",\"title\":\"President\"},\"1997\":{\"name\":\"Ernesto Zedillo\",\"title\":\"President\"},\"1998\":{\"name\":\"Ernesto Zedillo\",\"title\":\"President\"},\"1999\":{\"name\":\"Ernesto Zedillo\",\"title\":\"President\"},\"2000\":{\"name\":\"Vicente Fox\",\"title\":\"President\"},\"2001\":{\"name\":\"Vicente Fox\",\"title\":\"President\"},\"2002\":{\"name\":\"Vicente Fox\",\"title\":\"President\"},\"2003\":{\"name\":\"Vicente Fox\",\"title\":\"President\"},\"2004\":{\"name\":\"Vicente Fox\",\"title\":\"President\"},\"2005\":{\"name\":\"Vicente Fox\",\"title\":\"President\"},\"2006\":{\"name\":\"Felipe Calderón\",\"title\":\"President\"},\"2007\":{\"name\":\"Felipe Calderón\",\"title\":\"President\"},\"2008\":{\"name\":\"Felipe Calderón\",\"title\":\"President\"},\"2009\":{\"name\":\"Felipe Calderón\",\"title\":\"President\"},\"2010\":{\"name\":\"Felipe Calderón\",\"title\":\"President\"},\"2011\":{\"name\":\"Felipe Calderón\",\"title\":\"President\"},\"2012\":{\"name\":\"Enrique Peña Nieto\",\"title\":\"President\"},\"2013\":{\"name\":\"Enrique Peña Nieto\",\"title\":\"President\"},\"2014\":{\"name\":\"Enrique Peña Nieto\",\"title\":\"President\"},\"2015\":{\"name\":\"Enrique Peña Nieto\",\"title\":\"President\"},\"2016\":{\"name\":\"Enrique Peña Nieto\",\"title\":\"President\"},\"2017\":{\"name\":\"Enrique Peña Nieto\",\"title\":\"President\"},\"2018\":{\"name\":\"Andrés Manuel López Obrador\",\"title\":\"President\"},\"2019\":{\"name\":\"Andrés Manuel López Obrador\",\"title\":\"President\"},\"2020\":{\"name\":\"Andrés Manuel López Obrador\",\"title\":\"President\"},\"2021\":{\"name\":\"Andrés Manuel López Obrador\",\"title\":\"President\"},\"2022\":{\"name\":\"Andrés Manuel López Obrador\",\"title\":\"President\"},\"2023\":{\"name\":\"Andrés Manuel López Obrador\",\"title\":\"President\"},\"2024\":{\"name\":\"Claudia Sheinbaum\",\"title\":\"President\"},\"2025\":{\"name\":\"Claudia Sheinbaum\",\"title\":\"President\"}},\"Russia\":{\"1992\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"1993\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"1994\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"1995\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"1996\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"1997\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"1998\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"1999\":{\"name\":\"Boris Yeltsin\",\"title\":\"President\"},\"2000\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2001\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2002\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2003\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2004\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2005\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2006\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2007\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2008\":{\"name\":\"Dmitry Medvedev\",\"title\":\"President\"},\"2009\":{\"name\":\"Dmitry Medvedev\",\"title\":\"President\"},\"2010\":{\"name\":\"Dmitry Medvedev\",\"title\":\"President\"},\"2011\":{\"name\":\"Dmitry Medvedev\",\"title\":\"President\"},\"2012\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2013\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2014\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2015\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2016\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2017\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2018\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2019\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2020\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2021\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2022\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2023\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2024\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"},\"2025\":{\"name\":\"Vladimir Putin\",\"title\":\"President\"}},\"Indonesia\":{\"1950\":{\"name\":\"Assaat\",\"title\":\"President\"},\"1951\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1952\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1953\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1954\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1955\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1956\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1957\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1958\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1959\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1960\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1961\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1962\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1963\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1964\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1965\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1966\":{\"name\":\"Sukarno\",\"title\":\"President\"},\"1967\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1968\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1969\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1970\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1971\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1972\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1973\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1974\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1975\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1976\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1977\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1978\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1979\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1980\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1981\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1982\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1983\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1984\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1985\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1986\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1987\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1988\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1989\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1990\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1991\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1992\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1993\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1994\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1995\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1996\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1997\":{\"name\":\"Suharto\",\"title\":\"President\"},\"1998\":{\"name\":\"B. J. Habibie\",\"title\":\"President\"},\"1999\":{\"name\":\"B. J. Habibie\",\"title\":\"President\"},\"2000\":{\"name\":\"Abdurrahman Wahid\",\"title\":\"President\"},\"2001\":{\"name\":\"Abdurrahman Wahid\",\"title\":\"President\"},\"2002\":{\"name\":\"Megawati Soekarnoputri\",\"title\":\"President\"},\"2003\":{\"name\":\"Megawati Soekarnoputri\",\"title\":\"President\"},\"2004\":{\"name\":\"Megawati Soekarnoputri\",\"title\":\"President\"},\"2005\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2006\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2007\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2008\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2009\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2010\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2011\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2012\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2013\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2014\":{\"name\":\"Susilo Bambang Yudhoyono\",\"title\":\"President\"},\"2015\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2016\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2017\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2018\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2019\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2020\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2021\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2022\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2023\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2024\":{\"name\":\"Joko Widodo\",\"title\":\"President\"},\"2025\":{\"name\":\"Prabowo Subianto\",\"title\":\"President\"}},\"Turkey\":{\"1950\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1951\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1952\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1953\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1954\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1955\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1956\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1957\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1958\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1959\":{\"name\":\"Celâl Bayar\",\"title\":\"President\"},\"1962\":{\"name\":\"Cemal Gürsel\",\"title\":\"President\"},\"1963\":{\"name\":\"Cemal Gürsel\",\"title\":\"President\"},\"1964\":{\"name\":\"Cemal Gürsel\",\"title\":\"President\"},\"1965\":{\"name\":\"Cemal Gürsel\",\"title\":\"President\"},\"1966\":{\"name\":\"Cevdet Sunay\",\"title\":\"President\"},\"1967\":{\"name\":\"Cevdet Sunay\",\"title\":\"President\"},\"1968\":{\"name\":\"Cevdet Sunay\",\"title\":\"President\"},\"1969\":{\"name\":\"Cevdet Sunay\",\"title\":\"President\"},\"1970\":{\"name\":\"Cevdet Sunay\",\"title\":\"President\"},\"1971\":{\"name\":\"Cevdet Sunay\",\"title\":\"President\"},\"1972\":{\"name\":\"Cevdet Sunay\",\"title\":\"President\"},\"1973\":{\"name\":\"Fahri Korutürk\",\"title\":\"President\"},\"1974\":{\"name\":\"Fahri Korutürk\",\"title\":\"President\"},\"1975\":{\"name\":\"Fahri Korutürk\",\"title\":\"President\"},\"1976\":{\"name\":\"Fahri Korutürk\",\"title\":\"President\"},\"1977\":{\"name\":\"Fahri Korutürk\",\"title\":\"President\"},\"1978\":{\"name\":\"Fahri Korutürk\",\"title\":\"President\"},\"1979\":{\"name\":\"Fahri Korutürk\",\"title\":\"President\"},\"1980\":{\"name\":\"İhsan Sabri Çağlayangil\",\"title\":\"President\"},\"1981\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1982\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1983\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1984\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1985\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1986\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1987\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1988\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1989\":{\"name\":\"Kenan Evren\",\"title\":\"President\"},\"1990\":{\"name\":\"Turgut Özal\",\"title\":\"President\"},\"1991\":{\"name\":\"Turgut Özal\",\"title\":\"President\"},\"1992\":{\"name\":\"Turgut Özal\",\"title\":\"President\"},\"1993\":{\"name\":\"Süleyman Demirel\",\"title\":\"President\"},\"1994\":{\"name\":\"Süleyman Demirel\",\"title\":\"President\"},\"1995\":{\"name\":\"Süleyman Demirel\",\"title\":\"President\"},\"1996\":{\"name\":\"Süleyman Demirel\",\"title\":\"President\"},\"1997\":{\"name\":\"Süleyman Demirel\",\"title\":\"President\"},\"1998\":{\"name\":\"Süleyman Demirel\",\"title\":\"President\"},\"1999\":{\"name\":\"Süleyman Demirel\",\"title\":\"President\"},\"2000\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2001\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2002\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2003\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2004\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2005\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2006\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2007\":{\"name\":\"Ahmet Necdet Sezer\",\"title\":\"President\"},\"2008\":{\"name\":\"Abdullah Gül\",\"title\":\"President\"},\"2009\":{\"name\":\"Abdullah Gül\",\"title\":\"President\"},\"2010\":{\"name\":\"Abdullah Gül\",\"title\":\"President\"},\"2011\":{\"name\":\"Abdullah Gül\",\"title\":\"President\"},\"2012\":{\"name\":\"Abdullah Gül\",\"title\":\"President\"},\"2013\":{\"name\":\"Abdullah Gül\",\"title\":\"President\"},\"2014\":{\"name\":\"Abdullah Gül\",\"title\":\"President\"},\"2015\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2016\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2017\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2018\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2019\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2020\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2021\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2022\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2023\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2024\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"},\"2025\":{\"name\":\"Recep Tayyip Erdoğan\",\"title\":\"President\"}},\"Netherlands\":{\"1950\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Willem Drees\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Jan Eduard de Quay\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Jan Eduard de Quay\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Jan Eduard de Quay\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Jan Eduard de Quay\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Jan Eduard de Quay\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Victor Marijnen\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Jo Cals\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Jo Cals\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Piet de Jong\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Piet de Jong\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Piet de Jong\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Piet de Jong\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Piet de Jong\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Barend Biesheuvel\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Joop den Uyl\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Joop den Uyl\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Joop den Uyl\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Joop den Uyl\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Joop den Uyl\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Dries van Agt\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Dries van Agt\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Dries van Agt\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Dries van Agt\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Dries van Agt\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Ruud Lubbers\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Wim Kok\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Jan Peter Balkenende\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Mark Rutte\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Dick Schoof\",\"title\":\"Prime Minister\"}},\"New Zealand\":{\"1950\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Sidney Holland\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Walter Nash\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Walter Nash\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Walter Nash\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Keith Holyoake\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Jack Marshall\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Norman Kirk\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Norman Kirk\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Bill Rowling\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Robert Muldoon\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"David Lange\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"David Lange\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"David Lange\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"David Lange\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"David Lange\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Geoffrey Palmer\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Jim Bolger\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Jim Bolger\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Jim Bolger\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Jim Bolger\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Jim Bolger\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Jim Bolger\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Jim Bolger\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Jenny Shipley\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Jenny Shipley\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Helen Clark\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"John Key\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Bill English\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Jacinda Ardern\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Jacinda Ardern\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Jacinda Ardern\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Jacinda Ardern\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Jacinda Ardern\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Chris Hipkins\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Christopher Luxon\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Christopher Luxon\",\"title\":\"Prime Minister\"}},\"United Arab Emirates\":{\"1972\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1973\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1974\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1975\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1976\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1977\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1978\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1979\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1980\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1981\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1982\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1983\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1984\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1985\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1986\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1987\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1988\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1989\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1990\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1991\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1992\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1993\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1994\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1995\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1996\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1997\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1998\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"1999\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"2000\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"2001\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"2002\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"2003\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"2004\":{\"name\":\"Zayed bin Sultan Al Nahyan\",\"title\":\"President\"},\"2005\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2006\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2007\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2008\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2009\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2010\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2011\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2012\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2013\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2014\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2015\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2016\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2017\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2018\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2019\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2020\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2021\":{\"name\":\"Khalifa bin Zayed Al Nahyan\",\"title\":\"President\"},\"2022\":{\"name\":\"Mohammed Bin Zayed Al Nahyan\",\"title\":\"President\"},\"2023\":{\"name\":\"Mohammed Bin Zayed Al Nahyan\",\"title\":\"President\"},\"2024\":{\"name\":\"Mohammed Bin Zayed Al Nahyan\",\"title\":\"President\"},\"2025\":{\"name\":\"Mohammed Bin Zayed Al Nahyan\",\"title\":\"President\"}},\"Norway\":{\"1950\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Oscar Torp\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Oscar Torp\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Oscar Torp\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Einar Gerhardsen\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Per Borten\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Per Borten\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Per Borten\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Per Borten\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Per Borten\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Trygve Bratteli\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Trygve Bratteli\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Lars Korvald\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Trygve Bratteli\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Trygve Bratteli\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Odvar Nordli\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Odvar Nordli\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Odvar Nordli\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Odvar Nordli\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Odvar Nordli\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Kåre Willoch\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Kåre Willoch\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Kåre Willoch\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Kåre Willoch\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Jan P. Syse\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Gro Harlem Brundtland\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Thorbjørn Jagland\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Kjell Magne Bondevik\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Kjell Magne Bondevik\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Kjell Magne Bondevik\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Kjell Magne Bondevik\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Kjell Magne Bondevik\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Kjell Magne Bondevik\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Jens Stoltenberg\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Erna Solberg\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Jonas Gahr Støre\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Jonas Gahr Støre\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Jonas Gahr Støre\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Jonas Gahr Støre\",\"title\":\"Prime Minister\"}},\"Denmark\":{\"1950\":{\"name\":\"Hans Hedtoft\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Erik Eriksen\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Erik Eriksen\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Erik Eriksen\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Hans Hedtoft\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"H. C. Hansen\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"H. C. Hansen\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"H. C. Hansen\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"H. C. Hansen\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"H. C. Hansen\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Viggo Kampmann\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Viggo Kampmann\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Viggo Kampmann\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Jens Otto Krag\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Jens Otto Krag\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Jens Otto Krag\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Jens Otto Krag\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Jens Otto Krag\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Hilmar Baunsgaard\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Hilmar Baunsgaard\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Hilmar Baunsgaard\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Hilmar Baunsgaard\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Jens Otto Krag\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Poul Hartling\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Anker Jørgensen\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Poul Schlüter\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Poul Nyrup Rasmussen\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Anders Fogh Rasmussen\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Anders Fogh Rasmussen\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Anders Fogh Rasmussen\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Anders Fogh Rasmussen\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Anders Fogh Rasmussen\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Anders Fogh Rasmussen\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Anders Fogh Rasmussen\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Lars Løkke Rasmussen\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Lars Løkke Rasmussen\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Lars Løkke Rasmussen\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Helle Thorning-Schmidt\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Helle Thorning-Schmidt\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Helle Thorning-Schmidt\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Lars Løkke Rasmussen\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Lars Løkke Rasmussen\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Lars Løkke Rasmussen\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Lars Løkke Rasmussen\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Mette Frederiksen\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Mette Frederiksen\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Mette Frederiksen\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Mette Frederiksen\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Mette Frederiksen\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Mette Frederiksen\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Mette Frederiksen\",\"title\":\"Prime Minister\"}},\"Hong Kong\":{\"2005\":{\"name\":\"Donald Tsang\",\"title\":\"Chief Executive\"},\"2006\":{\"name\":\"Donald Tsang\",\"title\":\"Chief Executive\"},\"2007\":{\"name\":\"Donald Tsang\",\"title\":\"Chief Executive\"},\"2008\":{\"name\":\"Donald Tsang\",\"title\":\"Chief Executive\"},\"2009\":{\"name\":\"Donald Tsang\",\"title\":\"Chief Executive\"},\"2010\":{\"name\":\"Donald Tsang\",\"title\":\"Chief Executive\"},\"2011\":{\"name\":\"Donald Tsang\",\"title\":\"Chief Executive\"},\"2012\":{\"name\":\"CY Leung\",\"title\":\"Chief Executive\"},\"2013\":{\"name\":\"CY Leung\",\"title\":\"Chief Executive\"},\"2014\":{\"name\":\"CY Leung\",\"title\":\"Chief Executive\"},\"2015\":{\"name\":\"CY Leung\",\"title\":\"Chief Executive\"},\"2016\":{\"name\":\"CY Leung\",\"title\":\"Chief Executive\"},\"2017\":{\"name\":\"Carrie Lam\",\"title\":\"Chief Executive\"},\"2018\":{\"name\":\"Carrie Lam\",\"title\":\"Chief Executive\"},\"2019\":{\"name\":\"Carrie Lam\",\"title\":\"Chief Executive\"},\"2020\":{\"name\":\"Carrie Lam\",\"title\":\"Chief Executive\"},\"2021\":{\"name\":\"Carrie Lam\",\"title\":\"Chief Executive\"},\"2022\":{\"name\":\"John Lee\",\"title\":\"Chief Executive\"},\"2023\":{\"name\":\"John Lee\",\"title\":\"Chief Executive\"},\"2024\":{\"name\":\"John Lee\",\"title\":\"Chief Executive\"},\"2025\":{\"name\":\"John Lee\",\"title\":\"Chief Executive\"}},\"Taiwan\":{\"1950\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1951\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1952\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1953\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1954\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1955\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1956\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1957\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1958\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1959\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1960\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1961\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1962\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1963\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1964\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1965\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1966\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1967\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1968\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1969\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1970\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1971\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1972\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1973\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1974\":{\"name\":\"Chiang Kai-shek\",\"title\":\"President\"},\"1975\":{\"name\":\"Yen Chia-kan\",\"title\":\"President\"},\"1976\":{\"name\":\"Yen Chia-kan\",\"title\":\"President\"},\"1977\":{\"name\":\"Yen Chia-kan\",\"title\":\"President\"},\"1978\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1979\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1980\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1981\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1982\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1983\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1984\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1985\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1986\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1987\":{\"name\":\"Chiang Ching-kuo\",\"title\":\"President\"},\"1988\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1989\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1990\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1991\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1992\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1993\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1994\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1995\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1996\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1997\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1998\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"1999\":{\"name\":\"Lee Teng-hui\",\"title\":\"President\"},\"2000\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2001\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2002\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2003\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2004\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2005\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2006\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2007\":{\"name\":\"Chen Shui-bian\",\"title\":\"President\"},\"2008\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2009\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2010\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2011\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2012\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2013\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2014\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2015\":{\"name\":\"Ma Ying-jeou\",\"title\":\"President\"},\"2016\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2017\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2018\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2019\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2020\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2021\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2022\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2023\":{\"name\":\"Tsai Ing-wen\",\"title\":\"President\"},\"2024\":{\"name\":\"Lai Ching-te\",\"title\":\"President\"},\"2025\":{\"name\":\"Lai Ching-te\",\"title\":\"President\"}},\"India\":{\"1950\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Jawaharlal Nehru\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Lal Bahadur Shastri\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Lal Bahadur Shastri\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Morarji Desai\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Morarji Desai\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Charan Singh\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Indira Gandhi\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Rajiv Gandhi\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Rajiv Gandhi\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Rajiv Gandhi\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Rajiv Gandhi\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Rajiv Gandhi\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"V. P. Singh\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Chandra Shekhar\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"P. V. Narasimha Rao\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"P. V. Narasimha Rao\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"P. V. Narasimha Rao\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"P. V. Narasimha Rao\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"P. V. Narasimha Rao\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"H. D. Deve Gowda\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"I. K. Gujral\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Atal Bihari Vajpayee\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Atal Bihari Vajpayee\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Atal Bihari Vajpayee\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Atal Bihari Vajpayee\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Atal Bihari Vajpayee\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Atal Bihari Vajpayee\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Manmohan Singh\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Narendra Modi\",\"title\":\"Prime Minister\"}},\"Pakistan\":{\"1950\":{\"name\":\"Liaquat Ali Khan\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Khawaja Nazimuddin\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Khawaja Nazimuddin\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Mohammad Ali Bogra\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Mohammad Ali Bogra\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Chaudhry Muhammad Ali\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Huseyn Shaheed Suhrawardy\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"I. I. Chundrigar\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Feroz Khan Noon\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1960\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1961\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1962\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1963\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1964\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1965\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1966\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1967\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1968\":{\"name\":\"Ayub Khan\",\"title\":\"President\"},\"1969\":{\"name\":\"Yahya Khan\",\"title\":\"President\"},\"1970\":{\"name\":\"Yahya Khan\",\"title\":\"President\"},\"1971\":{\"name\":\"Zulfikar Ali Bhutto\",\"title\":\"President\"},\"1972\":{\"name\":\"Zulfikar Ali Bhutto\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Zulfikar Ali Bhutto\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Zulfikar Ali Bhutto\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Zulfikar Ali Bhutto\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Zulfikar Ali Bhutto\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Zulfikar Ali Bhutto\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1979\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1980\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1981\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1982\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1983\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1984\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1985\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1986\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1987\":{\"name\":\"Muhammad Zia-ul-Haq\",\"title\":\"President\"},\"1988\":{\"name\":\"Benazir Bhutto\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Benazir Bhutto\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Benazir Bhutto\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Benazir Bhutto\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Benazir Bhutto\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Benazir Bhutto\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Pervez Musharraf\",\"title\":\"Chief Executive\"},\"2000\":{\"name\":\"Pervez Musharraf\",\"title\":\"Chief Executive\"},\"2001\":{\"name\":\"Pervez Musharraf\",\"title\":\"Chief Executive\"},\"2002\":{\"name\":\"Pervez Musharraf\",\"title\":\"President\"},\"2003\":{\"name\":\"Pervez Musharraf\",\"title\":\"President\"},\"2004\":{\"name\":\"Pervez Musharraf\",\"title\":\"President\"},\"2005\":{\"name\":\"Pervez Musharraf\",\"title\":\"President\"},\"2006\":{\"name\":\"Pervez Musharraf\",\"title\":\"President\"},\"2007\":{\"name\":\"Pervez Musharraf\",\"title\":\"President\"},\"2008\":{\"name\":\"Yousaf Raza Gillani\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Yousaf Raza Gillani\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Yousaf Raza Gillani\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Yousaf Raza Gillani\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Yousaf Raza Gillani\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Nawaz Sharif\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Shahid Khaqan Abbasi\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Imran Khan\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Imran Khan\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Imran Khan\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Imran Khan\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Shehbaz Sharif\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Shehbaz Sharif\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Shehbaz Sharif\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Shehbaz Sharif\",\"title\":\"Prime Minister\"}},\"Australia\":{\"1950\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Robert Menzies\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Harold Holt\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"John McEwen\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"John Gorton\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"John Gorton\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"John Gorton\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"William McMahon\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Gough Whitlam\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Gough Whitlam\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Gough Whitlam\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Malcolm Fraser\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Bob Hawke\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Paul Keating\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Paul Keating\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Paul Keating\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Paul Keating\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Paul Keating\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"John Howard\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Kevin Rudd\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Kevin Rudd\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Kevin Rudd\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Julia Gillard\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Julia Gillard\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Julia Gillard\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Kevin Rudd\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Tony Abbott\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Malcolm Turnbull\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Malcolm Turnbull\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Malcolm Turnbull\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Scott Morrison\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Scott Morrison\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Scott Morrison\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Scott Morrison\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Anthony Albanese\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Anthony Albanese\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Anthony Albanese\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Anthony Albanese\",\"title\":\"Prime Minister\"}},\"Germany\":{\"1950\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1951\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1952\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1953\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1954\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1955\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1956\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1957\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1958\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1959\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1960\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1961\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1962\":{\"name\":\"Konrad Adenauer\",\"title\":\"Chancellor\"},\"1963\":{\"name\":\"Ludwig Erhard\",\"title\":\"Chancellor\"},\"1964\":{\"name\":\"Ludwig Erhard\",\"title\":\"Chancellor\"},\"1965\":{\"name\":\"Ludwig Erhard\",\"title\":\"Chancellor\"},\"1966\":{\"name\":\"Kurt Georg Kiesinger\",\"title\":\"Chancellor\"},\"1967\":{\"name\":\"Kurt Georg Kiesinger\",\"title\":\"Chancellor\"},\"1968\":{\"name\":\"Kurt Georg Kiesinger\",\"title\":\"Chancellor\"},\"1969\":{\"name\":\"Willy Brandt\",\"title\":\"Chancellor\"},\"1970\":{\"name\":\"Willy Brandt\",\"title\":\"Chancellor\"},\"1971\":{\"name\":\"Willy Brandt\",\"title\":\"Chancellor\"},\"1972\":{\"name\":\"Willy Brandt\",\"title\":\"Chancellor\"},\"1973\":{\"name\":\"Willy Brandt\",\"title\":\"Chancellor\"},\"1974\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1975\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1976\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1977\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1978\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1979\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1980\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1981\":{\"name\":\"Helmut Schmidt\",\"title\":\"Chancellor\"},\"1982\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1983\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1984\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1985\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1986\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1987\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1988\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1989\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1990\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1991\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1992\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1993\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1994\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1995\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1996\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1997\":{\"name\":\"Helmut Kohl\",\"title\":\"Chancellor\"},\"1998\":{\"name\":\"Gerhard Schröder\",\"title\":\"Chancellor\"},\"1999\":{\"name\":\"Gerhard Schröder\",\"title\":\"Chancellor\"},\"2000\":{\"name\":\"Gerhard Schröder\",\"title\":\"Chancellor\"},\"2001\":{\"name\":\"Gerhard Schröder\",\"title\":\"Chancellor\"},\"2002\":{\"name\":\"Gerhard Schröder\",\"title\":\"Chancellor\"},\"2003\":{\"name\":\"Gerhard Schröder\",\"title\":\"Chancellor\"},\"2004\":{\"name\":\"Gerhard Schröder\",\"title\":\"Chancellor\"},\"2005\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2006\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2007\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2008\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2009\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2010\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2011\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2012\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2013\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2014\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2015\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2016\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2017\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2018\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2019\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2020\":{\"name\":\"Angela Merkel\",\"title\":\"Chancellor\"},\"2021\":{\"name\":\"Olaf Scholz\",\"title\":\"Chancellor\"},\"2022\":{\"name\":\"Olaf Scholz\",\"title\":\"Chancellor\"},\"2023\":{\"name\":\"Olaf Scholz\",\"title\":\"Chancellor\"},\"2024\":{\"name\":\"Olaf Scholz\",\"title\":\"Chancellor\"},\"2025\":{\"name\":\"Friedrich Merz\",\"title\":\"Chancellor\"}},\"Japan\":{\"1950\":{\"name\":\"Shigeru Yoshida\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Shigeru Yoshida\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Shigeru Yoshida\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Shigeru Yoshida\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Ichirō Hatoyama\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Ichirō Hatoyama\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Tanzan Ishibashi\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Nobusuke Kishi\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Nobusuke Kishi\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Nobusuke Kishi\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Hayato Ikeda\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Hayato Ikeda\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Hayato Ikeda\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Hayato Ikeda\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Eisaku Satō\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Kakuei Tanaka\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Kakuei Tanaka\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Takeo Miki\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Takeo Miki\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Takeo Fukuda\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Takeo Fukuda\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Masayoshi Ōhira\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Masayoshi Ōhira\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Zenkō Suzuki\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Zenkō Suzuki\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Yasuhiro Nakasone\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Yasuhiro Nakasone\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Yasuhiro Nakasone\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Yasuhiro Nakasone\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Yasuhiro Nakasone\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Noboru Takeshita\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Noboru Takeshita\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Toshiki Kaifu\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Toshiki Kaifu\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Kiichi Miyazawa\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Kiichi Miyazawa\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Morihiro Hosokawa\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Tomiichi Murayama\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Ryūtarō Hashimoto\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Ryūtarō Hashimoto\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Ryūtarō Hashimoto\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Keizō Obuchi\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Keizō Obuchi\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Yoshirō Mori\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Junichirō Koizumi\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Junichirō Koizumi\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Junichirō Koizumi\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Junichirō Koizumi\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Junichirō Koizumi\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Yasuo Fukuda\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Tarō Asō\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Yukio Hatoyama\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Naoto Kan\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Yoshihiko Noda\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Shinzō Abe\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Yoshihide Suga\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Fumio Kishida\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Fumio Kishida\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Fumio Kishida\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Shigeru Ishiba\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Shigeru Ishiba\",\"title\":\"Prime Minister\"}},\"Italy\":{\"1950\":{\"name\":\"Alcide De Gasperi\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Alcide De Gasperi\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Alcide De Gasperi\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Giuseppe Pella\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Mario Scelba\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Antonio Segni\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Antonio Segni\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Adone Zoli\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Amintore Fanfani\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Antonio Segni\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Amintore Fanfani\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Amintore Fanfani\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Amintore Fanfani\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Aldo Moro\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Aldo Moro\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Aldo Moro\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Aldo Moro\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Aldo Moro\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Mariano Rumor\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Mariano Rumor\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Emilio Colombo\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Emilio Colombo\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Giulio Andreotti\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Mariano Rumor\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Aldo Moro\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Aldo Moro\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Giulio Andreotti\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Giulio Andreotti\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Giulio Andreotti\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Francesco Cossiga\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Francesco Cossiga\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Giovanni Spadolini\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Amintore Fanfani\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Bettino Craxi\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Bettino Craxi\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Bettino Craxi\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Bettino Craxi\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Amintore Fanfani\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Ciriaco De Mita\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Giulio Andreotti\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Giulio Andreotti\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Giulio Andreotti\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Giuliano Amato\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Carlo Azeglio Ciampi\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Lamberto Dini\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Romano Prodi\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Romano Prodi\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Massimo D'Alema\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Massimo D'Alema\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Giuliano Amato\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Romano Prodi\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Romano Prodi\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Silvio Berlusconi\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Mario Monti\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Mario Monti\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Enrico Letta\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Matteo Renzi\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Matteo Renzi\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Paolo Gentiloni\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Paolo Gentiloni\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Giuseppe Conte\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Giuseppe Conte\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Giuseppe Conte\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Mario Draghi\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Giorgia Meloni\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Giorgia Meloni\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Giorgia Meloni\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Giorgia Meloni\",\"title\":\"Prime Minister\"}},\"Spain\":{\"1950\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1951\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1952\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1953\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1954\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1955\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1956\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1957\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1958\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1959\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1960\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1961\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1962\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1963\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1964\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1965\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1966\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1967\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1968\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1969\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1970\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1971\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1972\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1973\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1974\":{\"name\":\"Francisco Franco\",\"title\":\"Head of State\"},\"1975\":{\"name\":\"Carlos Arias Navarro\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Adolfo Suárez\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Adolfo Suárez\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Adolfo Suárez\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Adolfo Suárez\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Adolfo Suárez\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Leopoldo Calvo-Sotelo\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Felipe González\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"José María Aznar\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"José Luis Rodríguez Zapatero\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"José Luis Rodríguez Zapatero\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"José Luis Rodríguez Zapatero\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"José Luis Rodríguez Zapatero\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"José Luis Rodríguez Zapatero\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"José Luis Rodríguez Zapatero\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"José Luis Rodríguez Zapatero\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Mariano Rajoy\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Mariano Rajoy\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Mariano Rajoy\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Mariano Rajoy\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Mariano Rajoy\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Mariano Rajoy\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Mariano Rajoy\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Pedro Sánchez\",\"title\":\"Prime Minister\"}},\"South Korea\":{\"1950\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1951\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1952\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1953\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1954\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1955\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1956\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1957\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1958\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1959\":{\"name\":\"Syngman Rhee\",\"title\":\"President\"},\"1960\":{\"name\":\"Yun Posun\",\"title\":\"President\"},\"1961\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1962\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1963\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1964\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1965\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1966\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1967\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1968\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1969\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1970\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1971\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1972\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1973\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1974\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1975\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1976\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1977\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1978\":{\"name\":\"Park Chung-hee\",\"title\":\"President\"},\"1979\":{\"name\":\"Choi Kyu-hah\",\"title\":\"President\"},\"1980\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1981\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1982\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1983\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1984\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1985\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1986\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1987\":{\"name\":\"Chun Doo-hwan\",\"title\":\"President\"},\"1988\":{\"name\":\"Roh Tae-woo\",\"title\":\"President\"},\"1989\":{\"name\":\"Roh Tae-woo\",\"title\":\"President\"},\"1990\":{\"name\":\"Roh Tae-woo\",\"title\":\"President\"},\"1991\":{\"name\":\"Roh Tae-woo\",\"title\":\"President\"},\"1992\":{\"name\":\"Roh Tae-woo\",\"title\":\"President\"},\"1993\":{\"name\":\"Kim Young-sam\",\"title\":\"President\"},\"1994\":{\"name\":\"Kim Young-sam\",\"title\":\"President\"},\"1995\":{\"name\":\"Kim Young-sam\",\"title\":\"President\"},\"1996\":{\"name\":\"Kim Young-sam\",\"title\":\"President\"},\"1997\":{\"name\":\"Kim Young-sam\",\"title\":\"President\"},\"1998\":{\"name\":\"Kim Dae-jung\",\"title\":\"President\"},\"1999\":{\"name\":\"Kim Dae-jung\",\"title\":\"President\"},\"2000\":{\"name\":\"Kim Dae-jung\",\"title\":\"President\"},\"2001\":{\"name\":\"Kim Dae-jung\",\"title\":\"President\"},\"2002\":{\"name\":\"Kim Dae-jung\",\"title\":\"President\"},\"2003\":{\"name\":\"Roh Moo-hyun\",\"title\":\"President\"},\"2004\":{\"name\":\"Roh Moo-hyun\",\"title\":\"President\"},\"2005\":{\"name\":\"Roh Moo-hyun\",\"title\":\"President\"},\"2006\":{\"name\":\"Roh Moo-hyun\",\"title\":\"President\"},\"2007\":{\"name\":\"Roh Moo-hyun\",\"title\":\"President\"},\"2008\":{\"name\":\"Lee Myung-bak\",\"title\":\"President\"},\"2009\":{\"name\":\"Lee Myung-bak\",\"title\":\"President\"},\"2010\":{\"name\":\"Lee Myung-bak\",\"title\":\"President\"},\"2011\":{\"name\":\"Lee Myung-bak\",\"title\":\"President\"},\"2012\":{\"name\":\"Lee Myung-bak\",\"title\":\"President\"},\"2013\":{\"name\":\"Park Geun-hye\",\"title\":\"President\"},\"2014\":{\"name\":\"Park Geun-hye\",\"title\":\"President\"},\"2015\":{\"name\":\"Park Geun-hye\",\"title\":\"President\"},\"2016\":{\"name\":\"Park Geun-hye\",\"title\":\"President\"},\"2017\":{\"name\":\"Moon Jae-in\",\"title\":\"President\"},\"2018\":{\"name\":\"Moon Jae-in\",\"title\":\"President\"},\"2019\":{\"name\":\"Moon Jae-in\",\"title\":\"President\"},\"2020\":{\"name\":\"Moon Jae-in\",\"title\":\"President\"},\"2021\":{\"name\":\"Moon Jae-in\",\"title\":\"President\"},\"2022\":{\"name\":\"Yoon Suk Yeol\",\"title\":\"President\"},\"2023\":{\"name\":\"Yoon Suk Yeol\",\"title\":\"President\"},\"2024\":{\"name\":\"Yoon Suk Yeol\",\"title\":\"President\"},\"2025\":{\"name\":\"Lee Jae-myung\",\"title\":\"President\"}},\"Israel\":{\"1950\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Moshe Sharett\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"David Ben-Gurion\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Levi Eshkol\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Levi Eshkol\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Levi Eshkol\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Levi Eshkol\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Levi Eshkol\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Levi Eshkol\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Golda Meir\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Golda Meir\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Golda Meir\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Golda Meir\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Golda Meir\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Yitzhak Rabin\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Yitzhak Rabin\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Yitzhak Rabin\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Menachem Begin\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Menachem Begin\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Menachem Begin\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Menachem Begin\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Menachem Begin\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Menachem Begin\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Yitzhak Shamir\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Shimon Peres\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Shimon Peres\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Yitzhak Shamir\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Yitzhak Shamir\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Yitzhak Shamir\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Yitzhak Shamir\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Yitzhak Shamir\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Yitzhak Shamir\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Yitzhak Rabin\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Yitzhak Rabin\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Yitzhak Rabin\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Shimon Peres\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Ehud Barak\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Ehud Barak\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Ariel Sharon\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Ariel Sharon\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Ariel Sharon\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Ariel Sharon\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Ariel Sharon\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Ehud Olmert\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Ehud Olmert\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Ehud Olmert\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Naftali Bennett\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Yair Lapid\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Benjamin Netanyahu\",\"title\":\"Prime Minister\"}},\"Ireland\":{\"1950\":{\"name\":\"Éamon de Valera\",\"title\":\"Taoiseach\"},\"1951\":{\"name\":\"Éamon de Valera\",\"title\":\"Taoiseach\"},\"1952\":{\"name\":\"Éamon de Valera\",\"title\":\"Taoiseach\"},\"1953\":{\"name\":\"Éamon de Valera\",\"title\":\"Taoiseach\"},\"1954\":{\"name\":\"John A. Costello\",\"title\":\"Taoiseach\"},\"1955\":{\"name\":\"John A. Costello\",\"title\":\"Taoiseach\"},\"1956\":{\"name\":\"John A. Costello\",\"title\":\"Taoiseach\"},\"1957\":{\"name\":\"Éamon de Valera\",\"title\":\"Taoiseach\"},\"1958\":{\"name\":\"Éamon de Valera\",\"title\":\"Taoiseach\"},\"1959\":{\"name\":\"Seán Lemass\",\"title\":\"Taoiseach\"},\"1960\":{\"name\":\"Seán Lemass\",\"title\":\"Taoiseach\"},\"1961\":{\"name\":\"Seán Lemass\",\"title\":\"Taoiseach\"},\"1962\":{\"name\":\"Seán Lemass\",\"title\":\"Taoiseach\"},\"1963\":{\"name\":\"Seán Lemass\",\"title\":\"Taoiseach\"},\"1964\":{\"name\":\"Seán Lemass\",\"title\":\"Taoiseach\"},\"1965\":{\"name\":\"Seán Lemass\",\"title\":\"Taoiseach\"},\"1966\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1967\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1968\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1969\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1970\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1971\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1972\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1973\":{\"name\":\"Liam Cosgrave\",\"title\":\"Taoiseach\"},\"1974\":{\"name\":\"Liam Cosgrave\",\"title\":\"Taoiseach\"},\"1975\":{\"name\":\"Liam Cosgrave\",\"title\":\"Taoiseach\"},\"1976\":{\"name\":\"Liam Cosgrave\",\"title\":\"Taoiseach\"},\"1977\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1978\":{\"name\":\"Jack Lynch\",\"title\":\"Taoiseach\"},\"1979\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1980\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1981\":{\"name\":\"Garret FitzGerald\",\"title\":\"Taoiseach\"},\"1982\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1983\":{\"name\":\"Garret FitzGerald\",\"title\":\"Taoiseach\"},\"1984\":{\"name\":\"Garret FitzGerald\",\"title\":\"Taoiseach\"},\"1985\":{\"name\":\"Garret FitzGerald\",\"title\":\"Taoiseach\"},\"1986\":{\"name\":\"Garret FitzGerald\",\"title\":\"Taoiseach\"},\"1987\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1988\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1989\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1990\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1991\":{\"name\":\"Charles Haughey\",\"title\":\"Taoiseach\"},\"1992\":{\"name\":\"Albert Reynolds\",\"title\":\"Taoiseach\"},\"1993\":{\"name\":\"Albert Reynolds\",\"title\":\"Taoiseach\"},\"1994\":{\"name\":\"John Bruton\",\"title\":\"Taoiseach\"},\"1995\":{\"name\":\"John Bruton\",\"title\":\"Taoiseach\"},\"1996\":{\"name\":\"John Bruton\",\"title\":\"Taoiseach\"},\"1997\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"1998\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"1999\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2000\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2001\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2002\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2003\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2004\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2005\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2006\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2007\":{\"name\":\"Bertie Ahern\",\"title\":\"Taoiseach\"},\"2008\":{\"name\":\"Brian Cowen\",\"title\":\"Taoiseach\"},\"2009\":{\"name\":\"Brian Cowen\",\"title\":\"Taoiseach\"},\"2010\":{\"name\":\"Brian Cowen\",\"title\":\"Taoiseach\"},\"2011\":{\"name\":\"Enda Kenny\",\"title\":\"Taoiseach\"},\"2012\":{\"name\":\"Enda Kenny\",\"title\":\"Taoiseach\"},\"2013\":{\"name\":\"Enda Kenny\",\"title\":\"Taoiseach\"},\"2014\":{\"name\":\"Enda Kenny\",\"title\":\"Taoiseach\"},\"2015\":{\"name\":\"Enda Kenny\",\"title\":\"Taoiseach\"},\"2016\":{\"name\":\"Enda Kenny\",\"title\":\"Taoiseach\"},\"2017\":{\"name\":\"Leo Varadkar\",\"title\":\"Taoiseach\"},\"2018\":{\"name\":\"Leo Varadkar\",\"title\":\"Taoiseach\"},\"2019\":{\"name\":\"Leo Varadkar\",\"title\":\"Taoiseach\"},\"2020\":{\"name\":\"Micheál Martin\",\"title\":\"Taoiseach\"},\"2021\":{\"name\":\"Micheál Martin\",\"title\":\"Taoiseach\"},\"2022\":{\"name\":\"Leo Varadkar\",\"title\":\"Taoiseach\"},\"2023\":{\"name\":\"Leo Varadkar\",\"title\":\"Taoiseach\"},\"2024\":{\"name\":\"Simon Harris\",\"title\":\"Taoiseach\"},\"2025\":{\"name\":\"Simon Harris\",\"title\":\"Taoiseach\"}},\"Sweden\":{\"1950\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"Tage Erlander\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"Thorbjörn Fälldin\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"Thorbjörn Fälldin\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"Ola Ullsten\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"Thorbjörn Fälldin\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"Thorbjörn Fälldin\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"Thorbjörn Fälldin\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1985\":{\"name\":\"Olof Palme\",\"title\":\"Prime Minister\"},\"1986\":{\"name\":\"Ingvar Carlsson\",\"title\":\"Prime Minister\"},\"1987\":{\"name\":\"Ingvar Carlsson\",\"title\":\"Prime Minister\"},\"1988\":{\"name\":\"Ingvar Carlsson\",\"title\":\"Prime Minister\"},\"1989\":{\"name\":\"Ingvar Carlsson\",\"title\":\"Prime Minister\"},\"1990\":{\"name\":\"Ingvar Carlsson\",\"title\":\"Prime Minister\"},\"1991\":{\"name\":\"Carl Bildt\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Carl Bildt\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Carl Bildt\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Ingvar Carlsson\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Ingvar Carlsson\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Göran Persson\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2007\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2008\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2009\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Fredrik Reinfeldt\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Stefan Löfven\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Ulf Kristersson\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Ulf Kristersson\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Ulf Kristersson\",\"title\":\"Prime Minister\"},\"2025\":{\"name\":\"Ulf Kristersson\",\"title\":\"Prime Minister\"}},\"Bangladesh\":{\"1971\":{\"name\":\"Sheikh Mujibur Rahman\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"Sheikh Mujibur Rahman\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"Sheikh Mujibur Rahman\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"Sheikh Mujibur Rahman\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"Sheikh Mujibur Rahman\",\"title\":\"President\"},\"1976\":{\"name\":\"Ziaur Rahman\",\"title\":\"President\"},\"1977\":{\"name\":\"Ziaur Rahman\",\"title\":\"President\"},\"1978\":{\"name\":\"Ziaur Rahman\",\"title\":\"President\"},\"1979\":{\"name\":\"Ziaur Rahman\",\"title\":\"President\"},\"1980\":{\"name\":\"Ziaur Rahman\",\"title\":\"President\"},\"1981\":{\"name\":\"Abdus Sattar\",\"title\":\"President\"},\"1982\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1983\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1984\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1985\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1986\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1987\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1988\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1989\":{\"name\":\"Hussain Muhammad Ershad\",\"title\":\"President\"},\"1990\":{\"name\":\"Shahabuddin Ahmed\",\"title\":\"Acting President\"},\"1991\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"1992\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"1993\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"1994\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"1995\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"1996\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"1997\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"1998\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"1999\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2000\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2001\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"2002\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"2003\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"2004\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"2005\":{\"name\":\"Khaleda Zia\",\"title\":\"Prime Minister\"},\"2006\":{\"name\":\"Fakhruddin Ahmed\",\"title\":\"Chief Adviser\"},\"2007\":{\"name\":\"Fakhruddin Ahmed\",\"title\":\"Chief Adviser\"},\"2008\":{\"name\":\"Fakhruddin Ahmed\",\"title\":\"Chief Adviser\"},\"2009\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2010\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2011\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2012\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2013\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2014\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2015\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2016\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2017\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2018\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2019\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2020\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2021\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2022\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2023\":{\"name\":\"Sheikh Hasina\",\"title\":\"Prime Minister\"},\"2024\":{\"name\":\"Muhammad Yunus\",\"title\":\"Chief Adviser\"},\"2025\":{\"name\":\"Muhammad Yunus\",\"title\":\"Chief Adviser\"}},\"South Africa\":{\"1950\":{\"name\":\"D. F. Malan\",\"title\":\"Prime Minister\"},\"1951\":{\"name\":\"D. F. Malan\",\"title\":\"Prime Minister\"},\"1952\":{\"name\":\"D. F. Malan\",\"title\":\"Prime Minister\"},\"1953\":{\"name\":\"D. F. Malan\",\"title\":\"Prime Minister\"},\"1954\":{\"name\":\"J. G. Strijdom\",\"title\":\"Prime Minister\"},\"1955\":{\"name\":\"J. G. Strijdom\",\"title\":\"Prime Minister\"},\"1956\":{\"name\":\"J. G. Strijdom\",\"title\":\"Prime Minister\"},\"1957\":{\"name\":\"J. G. Strijdom\",\"title\":\"Prime Minister\"},\"1958\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1959\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1960\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1961\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1962\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1963\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1964\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1965\":{\"name\":\"Hendrik Verwoerd\",\"title\":\"Prime Minister\"},\"1966\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1967\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1968\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1969\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1970\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1971\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1972\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1973\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1974\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1975\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1976\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1977\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1978\":{\"name\":\"John Vorster\",\"title\":\"Prime Minister\"},\"1979\":{\"name\":\"P. W. Botha\",\"title\":\"Prime Minister\"},\"1980\":{\"name\":\"P. W. Botha\",\"title\":\"Prime Minister\"},\"1981\":{\"name\":\"P. W. Botha\",\"title\":\"Prime Minister\"},\"1982\":{\"name\":\"P. W. Botha\",\"title\":\"Prime Minister\"},\"1983\":{\"name\":\"P. W. Botha\",\"title\":\"Prime Minister\"},\"1984\":{\"name\":\"P. W. Botha\",\"title\":\"State President\"},\"1985\":{\"name\":\"P. W. Botha\",\"title\":\"State President\"},\"1986\":{\"name\":\"P. W. Botha\",\"title\":\"State President\"},\"1987\":{\"name\":\"P. W. Botha\",\"title\":\"State President\"},\"1988\":{\"name\":\"P. W. Botha\",\"title\":\"State President\"},\"1989\":{\"name\":\"F. W. de Klerk\",\"title\":\"State President\"},\"1990\":{\"name\":\"F. W. de Klerk\",\"title\":\"State President\"},\"1991\":{\"name\":\"F. W. de Klerk\",\"title\":\"State President\"},\"1992\":{\"name\":\"F. W. de Klerk\",\"title\":\"State President\"},\"1993\":{\"name\":\"F. W. de Klerk\",\"title\":\"State President\"},\"1994\":{\"name\":\"Nelson Mandela\",\"title\":\"President\"},\"1995\":{\"name\":\"Nelson Mandela\",\"title\":\"President\"},\"1996\":{\"name\":\"Nelson Mandela\",\"title\":\"President\"},\"1997\":{\"name\":\"Nelson Mandela\",\"title\":\"President\"},\"1998\":{\"name\":\"Nelson Mandela\",\"title\":\"President\"},\"1999\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2000\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2001\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2002\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2003\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2004\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2005\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2006\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2007\":{\"name\":\"Thabo Mbeki\",\"title\":\"President\"},\"2008\":{\"name\":\"Kgalema Motlanthe\",\"title\":\"President\"},\"2009\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2010\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2011\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2012\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2013\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2014\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2015\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2016\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2017\":{\"name\":\"Jacob Zuma\",\"title\":\"President\"},\"2018\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"},\"2019\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"},\"2020\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"},\"2021\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"},\"2022\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"},\"2023\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"},\"2024\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"},\"2025\":{\"name\":\"Cyril Ramaphosa\",\"title\":\"President\"}},\"Egypt\":{\"1950\":{\"name\":\"Farouk I\",\"title\":\"King\"},\"1951\":{\"name\":\"Farouk I\",\"title\":\"King\"},\"1952\":{\"name\":\"Muhammad Naguib\",\"title\":\"President\"},\"1953\":{\"name\":\"Muhammad Naguib\",\"title\":\"President\"},\"1954\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1955\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1956\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1957\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1958\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1959\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1960\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1961\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1962\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1963\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1964\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1965\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1966\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1967\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1968\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1969\":{\"name\":\"Gamal Abdel Nasser\",\"title\":\"President\"},\"1970\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1971\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1972\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1973\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1974\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1975\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1976\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1977\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1978\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1979\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1980\":{\"name\":\"Anwar Sadat\",\"title\":\"President\"},\"1981\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1982\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1983\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1984\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1985\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1986\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1987\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1988\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1989\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1990\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1991\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1992\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1993\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1994\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1995\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1996\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1997\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1998\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"1999\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2000\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2001\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2002\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2003\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2004\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2005\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2006\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2007\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2008\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2009\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2010\":{\"name\":\"Hosni Mubarak\",\"title\":\"President\"},\"2011\":{\"name\":\"Mohamed Hussein Tantawi\",\"title\":\"Chairman of the SCAF\"},\"2012\":{\"name\":\"Mohamed Morsi\",\"title\":\"President\"},\"2013\":{\"name\":\"Adly Mansour\",\"title\":\"Acting President\"},\"2014\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2015\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2016\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2017\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2018\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2019\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2020\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2021\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2022\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2023\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2024\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"},\"2025\":{\"name\":\"Abdel Fattah el-Sisi\",\"title\":\"President\"}},\"Saudi Arabia\":{\"1950\":{\"name\":\"Abdulaziz Ibn Saud\",\"title\":\"King\"},\"1951\":{\"name\":\"Abdulaziz Ibn Saud\",\"title\":\"King\"},\"1952\":{\"name\":\"Abdulaziz Ibn Saud\",\"title\":\"King\"},\"1953\":{\"name\":\"Saud\",\"title\":\"King\"},\"1954\":{\"name\":\"Saud\",\"title\":\"King\"},\"1955\":{\"name\":\"Saud\",\"title\":\"King\"},\"1956\":{\"name\":\"Saud\",\"title\":\"King\"},\"1957\":{\"name\":\"Saud\",\"title\":\"King\"},\"1958\":{\"name\":\"Saud\",\"title\":\"King\"},\"1959\":{\"name\":\"Saud\",\"title\":\"King\"},\"1960\":{\"name\":\"Saud\",\"title\":\"King\"},\"1961\":{\"name\":\"Saud\",\"title\":\"King\"},\"1962\":{\"name\":\"Saud\",\"title\":\"King\"},\"1963\":{\"name\":\"Saud\",\"title\":\"King\"},\"1964\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1965\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1966\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1967\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1968\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1969\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1970\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1971\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1972\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1973\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1974\":{\"name\":\"Faisal\",\"title\":\"King\"},\"1975\":{\"name\":\"Khalid\",\"title\":\"King\"},\"1976\":{\"name\":\"Khalid\",\"title\":\"King\"},\"1977\":{\"name\":\"Khalid\",\"title\":\"King\"},\"1978\":{\"name\":\"Khalid\",\"title\":\"King\"},\"1979\":{\"name\":\"Khalid\",\"title\":\"King\"},\"1980\":{\"name\":\"Khalid\",\"title\":\"King\"},\"1981\":{\"name\":\"Khalid\",\"title\":\"King\"},\"1982\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1983\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1984\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1985\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1986\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1987\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1988\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1989\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1990\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1991\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1992\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1993\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1994\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1995\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1996\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1997\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1998\":{\"name\":\"Fahd\",\"title\":\"King\"},\"1999\":{\"name\":\"Fahd\",\"title\":\"King\"},\"2000\":{\"name\":\"Fahd\",\"title\":\"King\"},\"2001\":{\"name\":\"Fahd\",\"title\":\"King\"},\"2002\":{\"name\":\"Fahd\",\"title\":\"King\"},\"2003\":{\"name\":\"Fahd\",\"title\":\"King\"},\"2004\":{\"name\":\"Fahd\",\"title\":\"King\"},\"2005\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2006\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2007\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2008\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2009\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2010\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2011\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2012\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2013\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2014\":{\"name\":\"Abdullah\",\"title\":\"King\"},\"2015\":{\"name\":\"Salman\",\"title\":\"King\"},\"2016\":{\"name\":\"Salman\",\"title\":\"King\"},\"2017\":{\"name\":\"Salman\",\"title\":\"King\"},\"2018\":{\"name\":\"Salman\",\"title\":\"King\"},\"2019\":{\"name\":\"Salman\",\"title\":\"King\"},\"2020\":{\"name\":\"Salman\",\"title\":\"King\"},\"2021\":{\"name\":\"Salman\",\"title\":\"King\"},\"2022\":{\"name\":\"Salman\",\"title\":\"King\"},\"2023\":{\"name\":\"Salman\",\"title\":\"King\"},\"2024\":{\"name\":\"Salman\",\"title\":\"King\"},\"2025\":{\"name\":\"Salman\",\"title\":\"King\"}},\"Philippines\":{\"1950\":{\"name\":\"Elpidio Quirino\",\"title\":\"President\"},\"1951\":{\"name\":\"Elpidio Quirino\",\"title\":\"President\"},\"1952\":{\"name\":\"Elpidio Quirino\",\"title\":\"President\"},\"1953\":{\"name\":\"Ramon Magsaysay\",\"title\":\"President\"},\"1954\":{\"name\":\"Ramon Magsaysay\",\"title\":\"President\"},\"1955\":{\"name\":\"Ramon Magsaysay\",\"title\":\"President\"},\"1956\":{\"name\":\"Ramon Magsaysay\",\"title\":\"President\"},\"1957\":{\"name\":\"Carlos P. Garcia\",\"title\":\"President\"},\"1958\":{\"name\":\"Carlos P. Garcia\",\"title\":\"President\"},\"1959\":{\"name\":\"Carlos P. Garcia\",\"title\":\"President\"},\"1960\":{\"name\":\"Carlos P. Garcia\",\"title\":\"President\"},\"1961\":{\"name\":\"Diosdado Macapagal\",\"title\":\"President\"},\"1962\":{\"name\":\"Diosdado Macapagal\",\"title\":\"President\"},\"1963\":{\"name\":\"Diosdado Macapagal\",\"title\":\"President\"},\"1964\":{\"name\":\"Diosdado Macapagal\",\"title\":\"President\"},\"1965\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1966\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1967\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1968\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1969\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1970\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1971\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1972\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1973\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1974\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1975\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1976\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1977\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1978\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1979\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1980\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1981\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1982\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1983\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1984\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1985\":{\"name\":\"Ferdinand Marcos\",\"title\":\"President\"},\"1986\":{\"name\":\"Corazon Aquino\",\"title\":\"President\"},\"1987\":{\"name\":\"Corazon Aquino\",\"title\":\"President\"},\"1988\":{\"name\":\"Corazon Aquino\",\"title\":\"President\"},\"1989\":{\"name\":\"Corazon Aquino\",\"title\":\"President\"},\"1990\":{\"name\":\"Corazon Aquino\",\"title\":\"President\"},\"1991\":{\"name\":\"Corazon Aquino\",\"title\":\"President\"},\"1992\":{\"name\":\"Fidel V. Ramos\",\"title\":\"President\"},\"1993\":{\"name\":\"Fidel V. Ramos\",\"title\":\"President\"},\"1994\":{\"name\":\"Fidel V. Ramos\",\"title\":\"President\"},\"1995\":{\"name\":\"Fidel V. Ramos\",\"title\":\"President\"},\"1996\":{\"name\":\"Fidel V. Ramos\",\"title\":\"President\"},\"1997\":{\"name\":\"Fidel V. Ramos\",\"title\":\"President\"},\"1998\":{\"name\":\"Joseph Estrada\",\"title\":\"President\"},\"1999\":{\"name\":\"Joseph Estrada\",\"title\":\"President\"},\"2000\":{\"name\":\"Joseph Estrada\",\"title\":\"President\"},\"2001\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2002\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2003\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2004\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2005\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2006\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2007\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2008\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2009\":{\"name\":\"Gloria Macapagal Arroyo\",\"title\":\"President\"},\"2010\":{\"name\":\"Benigno Aquino III\",\"title\":\"President\"},\"2011\":{\"name\":\"Benigno Aquino III\",\"title\":\"President\"},\"2012\":{\"name\":\"Benigno Aquino III\",\"title\":\"President\"},\"2013\":{\"name\":\"Benigno Aquino III\",\"title\":\"President\"},\"2014\":{\"name\":\"Benigno Aquino III\",\"title\":\"President\"},\"2015\":{\"name\":\"Benigno Aquino III\",\"title\":\"President\"},\"2016\":{\"name\":\"Rodrigo Duterte\",\"title\":\"President\"},\"2017\":{\"name\":\"Rodrigo Duterte\",\"title\":\"President\"},\"2018\":{\"name\":\"Rodrigo Duterte\",\"title\":\"President\"},\"2019\":{\"name\":\"Rodrigo Duterte\",\"title\":\"President\"},\"2020\":{\"name\":\"Rodrigo Duterte\",\"title\":\"President\"},\"2021\":{\"name\":\"Rodrigo Duterte\",\"title\":\"President\"},\"2022\":{\"name\":\"Bongbong Marcos\",\"title\":\"President\"},\"2023\":{\"name\":\"Bongbong Marcos\",\"title\":\"President\"},\"2024\":{\"name\":\"Bongbong Marcos\",\"title\":\"President\"},\"2025\":{\"name\":\"Bongbong Marcos\",\"title\":\"President\"}}}")
};
var prices_default = {
	meta: {
		"source": "US BLS / Census / USPS historical snapshots (bundled estimates)",
		"note": "Nearest yearly reading; not exact daily prices."
	},
	years: {
		"1960": {
			"bread": .2,
			"gas": .31,
			"stamp": .04,
			"wage": 1,
			"house": 12650,
			"cpi": 29.6
		},
		"1969": {
			"bread": .23,
			"gas": .35,
			"stamp": .06,
			"wage": 1.3,
			"house": 25700,
			"cpi": 36.7
		},
		"1975": {
			"bread": .36,
			"gas": .57,
			"stamp": .1,
			"wage": 2.1,
			"house": 39300,
			"cpi": 53.8
		},
		"1980": {
			"bread": .51,
			"gas": 1.19,
			"stamp": .15,
			"wage": 3.1,
			"house": 64700,
			"cpi": 82.4
		},
		"1985": {
			"bread": .55,
			"gas": 1.12,
			"stamp": .22,
			"wage": 3.35,
			"house": 84300,
			"cpi": 107.6
		},
		"1989": {
			"bread": .66,
			"gas": 1,
			"stamp": .25,
			"wage": 3.35,
			"house": 12e4,
			"cpi": 124
		},
		"1990": {
			"bread": .7,
			"gas": 1.16,
			"stamp": .25,
			"wage": 3.8,
			"house": 122900,
			"cpi": 130.7
		},
		"1995": {
			"bread": .78,
			"gas": 1.15,
			"stamp": .32,
			"wage": 4.25,
			"house": 133900,
			"cpi": 152.4
		},
		"1997": {
			"bread": .87,
			"gas": 1.23,
			"stamp": .32,
			"wage": 5.15,
			"house": 146e3,
			"cpi": 160.5
		},
		"2000": {
			"bread": .99,
			"gas": 1.51,
			"stamp": .33,
			"wage": 5.15,
			"house": 169e3,
			"cpi": 172.2
		},
		"2005": {
			"bread": 1.2,
			"gas": 2.3,
			"stamp": .37,
			"wage": 5.15,
			"house": 240900,
			"cpi": 195.3
		},
		"2010": {
			"bread": 1.41,
			"gas": 2.79,
			"stamp": .44,
			"wage": 7.25,
			"house": 221800,
			"cpi": 218.1
		},
		"2015": {
			"bread": 1.44,
			"gas": 2.45,
			"stamp": .49,
			"wage": 7.25,
			"house": 294e3,
			"cpi": 237
		},
		"2017": {
			"bread": 1.34,
			"gas": 2.53,
			"stamp": .49,
			"wage": 7.25,
			"house": 323100,
			"cpi": 245.1
		},
		"2020": {
			"bread": 1.52,
			"gas": 2.17,
			"stamp": .55,
			"wage": 7.25,
			"house": 336900,
			"cpi": 258.8
		},
		"2024": {
			"bread": 1.98,
			"gas": 3.3,
			"stamp": .73,
			"wage": 7.25,
			"house": 412300,
			"cpi": 314.4
		},
		"2025": {
			"bread": 2.02,
			"gas": 3.2,
			"stamp": .73,
			"wage": 7.25,
			"house": 42e4,
			"cpi": 320
		}
	},
	currentYear: 2025
};
// worker/data/stars.json
var stars_default = [
	{
		"name": "Proxima Centauri",
		"constellation": "Centaurus",
		"ly": 4.24
	},
	{
		"name": "Barnard's Star",
		"constellation": "Ophiuchus",
		"ly": 5.96
	},
	{
		"name": "Wolf 359",
		"constellation": "Leo",
		"ly": 7.86
	},
	{
		"name": "Sirius",
		"constellation": "Canis Major",
		"ly": 8.6
	},
	{
		"name": "Epsilon Eridani",
		"constellation": "Eridanus",
		"ly": 10.5
	},
	{
		"name": "Procyon",
		"constellation": "Canis Minor",
		"ly": 11.5
	},
	{
		"name": "Tau Ceti",
		"constellation": "Cetus",
		"ly": 11.9
	},
	{
		"name": "Van Maanen's Star",
		"constellation": "Pisces",
		"ly": 14.1
	},
	{
		"name": "Altair",
		"constellation": "Aquila",
		"ly": 16.7
	},
	{
		"name": "Vega",
		"constellation": "Lyra",
		"ly": 25
	},
	{
		"name": "Fomalhaut",
		"constellation": "Piscis Austrinus",
		"ly": 25.1
	},
	{
		"name": "Pollux",
		"constellation": "Gemini",
		"ly": 33.8
	},
	{
		"name": "Arcturus",
		"constellation": "Boötes",
		"ly": 36.7
	},
	{
		"name": "Capella",
		"constellation": "Auriga",
		"ly": 42.9
	},
	{
		"name": "Rana",
		"constellation": "Eridanus",
		"ly": 29
	},
	{
		"name": "Aldebaran",
		"constellation": "Taurus",
		"ly": 65
	},
	{
		"name": "Spica",
		"constellation": "Virgo",
		"ly": 250
	},
	{
		"name": "Antares",
		"constellation": "Scorpius",
		"ly": 550
	},
	{
		"name": "Betelgeuse",
		"constellation": "Orion",
		"ly": 640
	},
	{
		"name": "Rigel",
		"constellation": "Orion",
		"ly": 860
	},
	{
		"name": "Deneb",
		"constellation": "Cygnus",
		"ly": 2600
	}
];
var market_default = {
	meta: {
		"source": "Bundled approximate calendar-year S&P 500 total-return proxies and World Bank gold averages",
		"note": "Illustrative compounded growth from year-end levels; not investment advice."
	},
	sp500Index: {
		"1960": 58,
		"1969": 92,
		"1975": 90,
		"1980": 136,
		"1984": 167,
		"1985": 211,
		"1989": 353,
		"1990": 330,
		"1995": 616,
		"1997": 970,
		"2000": 1320,
		"2005": 1248,
		"2010": 1258,
		"2014": 2059,
		"2015": 2044,
		"2017": 2674,
		"2020": 3756,
		"2024": 5882,
		"2025": 6100
	},
	goldUsdOz: {
		"1984": 361,
		"1985": 317,
		"1989": 381,
		"1990": 384,
		"1995": 384,
		"1997": 331,
		"2000": 279,
		"2005": 445,
		"2010": 1225,
		"2014": 1266,
		"2015": 1160,
		"2017": 1257,
		"2020": 1770,
		"2024": 2385,
		"2025": 2650
	},
	currentYear: 2025
};
// worker/data/culture.json
var culture_default = {
	"1969": {
		"film": "Butch Cassidy and the Sundance Kid",
		"generation": "Generation X cusp / late Boomer",
		"note": "Apollo fever and protest anthems defined the air."
	},
	"1977": {
		"film": "Star Wars",
		"generation": "Generation X",
		"note": "Blockbuster cinema and disco nights."
	},
	"1980": {
		"film": "The Empire Strikes Back",
		"generation": "Generation X",
		"note": "Arcade glow and new-wave radio."
	},
	"1985": {
		"film": "Back to the Future",
		"generation": "Millennial cusp / Gen X",
		"note": "Synth-pop and suburban VHS nights."
	},
	"1989": {
		"film": "Batman",
		"generation": "Millennials",
		"note": "Walls falling and Walkmans everywhere."
	},
	"1990": {
		"film": "Home Alone",
		"generation": "Millennials",
		"note": "Early internet whispers and Saturday cartoons."
	},
	"1995": {
		"film": "Toy Story",
		"generation": "Millennials",
		"note": "Dial-up beginnings and CGI firsts."
	},
	"1997": {
		"film": "Titanic",
		"generation": "Millennials",
		"note": "Boy bands warming up; the web leaving campus."
	},
	"2000": {
		"film": "Gladiator",
		"generation": "Millennials",
		"note": "Y2K anxiety melting into a new century."
	},
	"2005": {
		"film": "Harry Potter and the Goblet of Fire",
		"generation": "Millennials / Gen Z cusp",
		"note": "MySpace profiles and flip phones."
	},
	"2010": {
		"film": "Toy Story 3",
		"generation": "Generation Z",
		"note": "Instagram’s first summer and smartphone ubiquity."
	},
	"2015": {
		"film": "Star Wars: The Force Awakens",
		"generation": "Generation Z",
		"note": "Streaming wars and meme fluency."
	},
	"2017": {
		"film": "Star Wars: The Last Jedi",
		"generation": "Generation Z",
		"note": "Always-on feeds and shared screens."
	},
	"2020": {
		"film": "Nomadland",
		"generation": "Generation Alpha cusp",
		"note": "A quieter world, suddenly indoors."
	},
	"2024": {
		"film": "Wicked",
		"generation": "Generation Alpha",
		"note": "AI tools and short-form everything."
	}
};
// worker/lib/lookups.ts
function yearKeys(obj) {
	return Object.keys(obj).map(Number).sort((a, b) => a - b);
}
function nearestYear(year, keys) {
	let best = keys[0];
	let bestDist = Math.abs(year - best);
	for (const k of keys) {
		const dist = Math.abs(year - k);
		if (dist < bestDist || dist === bestDist && k <= year) {
			best = k;
			bestDist = dist;
		}
	}
	return best;
}
function lookupSong(date) {
	const target = Date.parse(date + "T00:00:00Z");
	let best = null;
	for (const row of billboard_default) if (Date.parse(row.date + "T00:00:00Z") <= target) best = row;
	else break;
	return best;
}
function lookupPrices(year) {
	const years = prices_default.years;
	const thenKey = nearestYear(year, yearKeys(years));
	const nowKey = prices_default.currentYear;
	const then = years[String(thenKey)];
	const now = years[String(nowKey)];
	return {
		thenYear: thenKey,
		nowYear: nowKey,
		then,
		now,
		dollarThenWorthNow: now.cpi / then.cpi
	};
}
function lookupStar(age) {
	const list = stars_default;
	let best = list[0];
	let bestDist = Math.abs(age - best.ly);
	for (const s of list) {
		const dist = Math.abs(age - s.ly);
		if (dist < bestDist) {
			best = s;
			bestDist = dist;
		}
	}
	return {
		...best,
		ageYears: age,
		deltaLy: Number((best.ly - age).toFixed(2))
	};
}
function lookupMarket(year) {
	const sp = market_default.sp500Index;
	const gold = market_default.goldUsdOz;
	const spKeys = yearKeys(sp);
	const goldKeys = yearKeys(gold);
	const thenSpYear = nearestYear(year, spKeys);
	const nowYear = market_default.currentYear;
	const thenSp = sp[String(thenSpYear)];
	const nowSp = sp[String(nowYear)];
	const invested = 1e3;
	const spValue = thenSp ? invested * nowSp / thenSp : null;
	let goldValue = null;
	let thenGoldYear = null;
	if (year >= 1984) {
		thenGoldYear = nearestYear(Math.max(year, 1984), goldKeys);
		const thenGold = gold[String(thenGoldYear)];
		const nowGold = gold[String(nowYear)];
		goldValue = thenGold ? invested * nowGold / thenGold : null;
	}
	return {
		invested,
		thenSpYear,
		nowYear,
		spValue,
		thenGoldYear,
		goldValue
	};
}
function lookupCulture(year) {
	const map = culture_default;
	const key = nearestYear(year, yearKeys(map));
	return {
		year: key,
		...map[String(key)]
	};
}
var FILMS = films_default;
/** US domestic calendar-year box-office #1 (BOM 1977+; estimated earlier). */
function lookupFilm(year) {
	const { minYear, maxYear } = FILMS.coverage;
	const clamped = Math.min(maxYear, Math.max(minYear, year));
	const row = FILMS.byYear[String(clamped)];
	if (!row) return {
		year,
		dataYear: null,
		clamped: false,
		title: null,
		market: null,
		metric: null,
		estimated: false,
		source: FILMS.source,
		notes: FILMS.notes,
		coverage: FILMS.coverage
	};
	return {
		year,
		dataYear: clamped,
		clamped: clamped !== year,
		title: row.title,
		market: row.market,
		metric: row.metric,
		estimated: row.estimated,
		source: FILMS.source,
		notes: FILMS.notes,
		coverage: FILMS.coverage
	};
}
var ZODIAC = [
	{
		name: "Capricorn",
		from: [12, 22],
		to: [1, 19]
	},
	{
		name: "Aquarius",
		from: [1, 20],
		to: [2, 18]
	},
	{
		name: "Pisces",
		from: [2, 19],
		to: [3, 20]
	},
	{
		name: "Aries",
		from: [3, 21],
		to: [4, 19]
	},
	{
		name: "Taurus",
		from: [4, 20],
		to: [5, 20]
	},
	{
		name: "Gemini",
		from: [5, 21],
		to: [6, 20]
	},
	{
		name: "Cancer",
		from: [6, 21],
		to: [7, 22]
	},
	{
		name: "Leo",
		from: [7, 23],
		to: [8, 22]
	},
	{
		name: "Virgo",
		from: [8, 23],
		to: [9, 22]
	},
	{
		name: "Libra",
		from: [9, 23],
		to: [10, 22]
	},
	{
		name: "Scorpio",
		from: [10, 23],
		to: [11, 21]
	},
	{
		name: "Sagittarius",
		from: [11, 22],
		to: [12, 21]
	}
];
var BIRTHSTONES = {
	1: "Garnet",
	2: "Amethyst",
	3: "Aquamarine",
	4: "Diamond",
	5: "Emerald",
	6: "Pearl",
	7: "Ruby",
	8: "Peridot",
	9: "Sapphire",
	10: "Opal",
	11: "Topaz",
	12: "Turquoise"
};
var CHINESE = [
	"Rat",
	"Ox",
	"Tiger",
	"Rabbit",
	"Dragon",
	"Snake",
	"Horse",
	"Goat",
	"Monkey",
	"Rooster",
	"Dog",
	"Pig"
];
function westernZodiac(month, day) {
	for (const z of ZODIAC) {
		const [fm, fd] = z.from;
		const [tm, td] = z.to;
		if (fm < tm) {
			if (month === fm && day >= fd || month === tm && day <= td || month > fm && month < tm) return z.name;
		} else if (month === fm && day >= fd || month === tm && day <= td || month > fm || month < tm) return z.name;
	}
	return "Capricorn";
}
function birthMeta(date) {
	const [y, m, d] = date.split("-").map(Number);
	return {
		westernZodiac: westernZodiac(m, d),
		chineseZodiac: CHINESE[(y - 1900) % 12],
		birthstone: BIRTHSTONES[m]
	};
}
function lifeNumbers(date, now = /* @__PURE__ */ new Date()) {
	const [y, m, d] = date.split("-").map(Number);
	const birth = Date.UTC(y, m - 1, d);
	const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	const days = Math.max(0, Math.floor((today - birth) / 864e5));
	const ageExact = days / 365.2425;
	return {
		days,
		orbits: Number(ageExact.toFixed(2)),
		heartbeats: Math.round(days * 24 * 60 * 70),
		fullMoons: Math.round(days / 29.530588)
	};
}
var BIRTHS_POP = births_population_default;
/** UN WPP world births + mid-year population for the birth year (1950–2023). */
function lookupBirths(year) {
	const { minYear, maxYear } = BIRTHS_POP.coverage;
	const clamped = Math.min(maxYear, Math.max(minYear, year));
	const row = BIRTHS_POP.byYear[String(clamped)];
	if (!row) return {
		year,
		dataYear: null,
		clamped: false,
		dailyBirths: null,
		annualBirths: null,
		worldPopulation: null,
		source: BIRTHS_POP.source,
		notes: BIRTHS_POP.notes,
		coverage: BIRTHS_POP.coverage
	};
	return {
		year,
		dataYear: clamped,
		clamped: clamped !== year,
		dailyBirths: row.dailyBirths,
		annualBirths: row.births,
		worldPopulation: row.population,
		source: BIRTHS_POP.source,
		notes: BIRTHS_POP.notes,
		coverage: BIRTHS_POP.coverage
	};
}
var LEADERS = leaders_default;
function resolveLeaderCountry(country) {
	if (!country?.trim()) return null;
	const raw = country.trim();
	if (LEADERS.byCountry[raw]) return raw;
	const alias = LEADERS.aliases[raw.toLowerCase()];
	if (alias && LEADERS.byCountry[alias]) return alias;
	const lower = raw.toLowerCase();
	for (const key of Object.keys(LEADERS.byCountry)) if (key.toLowerCase() === lower) return key;
	return null;
}
/** Mid-year national leader for the birth country (keepsake; soft language). */
function lookupLeaders(year, country) {
	const { minYear, maxYear } = LEADERS.coverage;
	const clamped = Math.min(maxYear, Math.max(minYear, year));
	const resolved = resolveLeaderCountry(country);
	const row = resolved ? LEADERS.byCountry[resolved]?.[String(clamped)] : void 0;
	return {
		year,
		dataYear: row ? clamped : null,
		clamped: row ? clamped !== year : false,
		countryInput: country?.trim() || null,
		country: resolved,
		name: row?.name ?? null,
		title: row?.title ?? null,
		supported: Boolean(resolved),
		source: LEADERS.source,
		notes: LEADERS.notes,
		coverage: LEADERS.coverage
	};
}
// worker/lib/starmap.ts
var STAR_CATALOG = {
	source: "Yale Bright Star Catalogue via d3-celestial stars.6 (mag ≤ 5.2) + IAU constellation figures",
	magLimit: 5.2,
	stars: [
		[
			6.75248,
			-16.7161,
			-1.44
		],
		[
			6.3992,
			-52.6957,
			-.62
		],
		[
			14.26102,
			19.1824,
			-.05
		],
		[
			14.66014,
			-60.834,
			-.01
		],
		[
			18.61565,
			38.7837,
			.03
		],
		[
			5.27815,
			45.998,
			.08
		],
		[
			5.2423,
			-8.2016,
			.18
		],
		[
			7.65503,
			5.225,
			.4
		],
		[
			1.62857,
			-57.2368,
			.45
		],
		[
			5.91953,
			7.4071,
			.45
		],
		[
			14.06373,
			-60.373,
			.61
		],
		[
			19.84639,
			8.8683,
			.76
		],
		[
			12.44331,
			-63.0991,
			.77
		],
		[
			4.59868,
			16.5093,
			.87
		],
		[
			13.41988,
			-11.1613,
			.98
		],
		[
			16.49013,
			-26.432,
			1.06
		],
		[
			7.75527,
			28.0262,
			1.16
		],
		[
			22.96085,
			-29.6222,
			1.17
		],
		[
			12.79535,
			-59.6888,
			1.25
		],
		[
			20.69053,
			45.2803,
			1.25
		],
		[
			14.65975,
			-60.8372,
			1.35
		],
		[
			10.13953,
			11.9672,
			1.36
		],
		[
			6.9771,
			-28.9721,
			1.5
		],
		[
			7.57663,
			31.8883,
			1.58
		],
		[
			12.51943,
			-57.1132,
			1.59
		],
		[
			17.56015,
			-37.1038,
			1.62
		],
		[
			5.41885,
			6.3497,
			1.64
		],
		[
			5.4382,
			28.6075,
			1.65
		],
		[
			9.21999,
			-69.7172,
			1.67
		],
		[
			5.60356,
			-1.2019,
			1.69
		],
		[
			22.13722,
			-46.961,
			1.73
		],
		[
			5.67931,
			-1.9426,
			1.74
		],
		[
			8.15887,
			-47.3366,
			1.75
		],
		[
			12.90049,
			55.9598,
			1.76
		],
		[
			3.40538,
			49.8612,
			1.79
		],
		[
			18.40287,
			-34.3846,
			1.79
		],
		[
			11.06213,
			61.751,
			1.81
		],
		[
			7.13986,
			-26.3932,
			1.83
		],
		[
			13.79235,
			49.3133,
			1.85
		],
		[
			8.37523,
			-59.5095,
			1.86
		],
		[
			17.62198,
			-42.9978,
			1.86
		],
		[
			5.99215,
			44.9474,
			1.9
		],
		[
			16.81108,
			-69.0277,
			1.91
		],
		[
			6.62853,
			16.3993,
			1.93
		],
		[
			8.74506,
			-54.7088,
			1.93
		],
		[
			20.42746,
			-56.7351,
			1.94
		],
		[
			2.5303,
			89.2641,
			1.97
		],
		[
			6.37833,
			-17.9559,
			1.98
		],
		[
			9.45979,
			-8.6586,
			1.99
		],
		[
			2.11956,
			23.4624,
			2.01
		],
		[
			10.33287,
			19.8415,
			2.01
		],
		[
			.72649,
			-17.9866,
			2.04
		],
		[
			18.92109,
			-26.2967,
			2.05
		],
		[
			14.11137,
			-36.37,
			2.06
		],
		[
			.13979,
			29.0904,
			2.07
		],
		[
			1.1622,
			35.6206,
			2.07
		],
		[
			5.79594,
			-9.6696,
			2.07
		],
		[
			14.84509,
			74.1555,
			2.07
		],
		[
			22.71113,
			-46.8846,
			2.07
		],
		[
			17.58224,
			12.56,
			2.08
		],
		[
			3.13615,
			40.9556,
			2.09
		],
		[
			2.06499,
			42.3297,
			2.1
		],
		[
			11.81766,
			14.5721,
			2.14
		],
		[
			.94515,
			60.7167,
			2.15
		],
		[
			12.69195,
			-48.9599,
			2.2
		],
		[
			8.05973,
			-40.0031,
			2.21
		],
		[
			9.28483,
			-59.2752,
			2.21
		],
		[
			15.57813,
			26.7147,
			2.22
		],
		[
			9.13327,
			-43.4326,
			2.23
		],
		[
			13.39876,
			54.9254,
			2.23
		],
		[
			20.37047,
			40.2567,
			2.23
		],
		[
			.67512,
			56.5373,
			2.24
		],
		[
			17.94343,
			51.4889,
			2.24
		],
		[
			5.53345,
			-.2991,
			2.25
		],
		[
			.15297,
			59.1498,
			2.28
		],
		[
			13.66479,
			-53.4664,
			2.29
		],
		[
			16.00556,
			-22.6217,
			2.29
		],
		[
			16.83606,
			-34.2932,
			2.29
		],
		[
			14.69882,
			-47.3882,
			2.3
		],
		[
			14.59179,
			-42.1578,
			2.33
		],
		[
			11.03069,
			56.3824,
			2.34
		],
		[
			14.74978,
			27.0742,
			2.35
		],
		[
			21.73643,
			9.875,
			2.38
		],
		[
			17.70813,
			-39.03,
			2.39
		],
		[
			.43807,
			-42.306,
			2.4
		],
		[
			11.89718,
			53.6948,
			2.41
		],
		[
			17.17297,
			-15.7249,
			2.43
		],
		[
			23.06291,
			28.0828,
			2.44
		],
		[
			7.40159,
			-29.3031,
			2.45
		],
		[
			21.30966,
			62.5856,
			2.45
		],
		[
			9.36856,
			-55.0107,
			2.47
		],
		[
			20.77019,
			33.9703,
			2.48
		],
		[
			23.07935,
			15.2053,
			2.49
		],
		[
			3.03799,
			4.0897,
			2.54
		],
		[
			16.61931,
			-10.5671,
			2.54
		],
		[
			13.92566,
			-47.2884,
			2.55
		],
		[
			11.23514,
			20.5237,
			2.56
		],
		[
			16.09062,
			-19.8055,
			2.56
		],
		[
			5.54551,
			-17.8223,
			2.58
		],
		[
			12.13931,
			-50.7224,
			2.58
		],
		[
			12.26343,
			-17.5419,
			2.58
		],
		[
			19.04353,
			-29.8801,
			2.6
		],
		[
			15.28345,
			-9.3829,
			2.61
		],
		[
			15.7378,
			6.4256,
			2.63
		],
		[
			1.91067,
			20.808,
			2.64
		],
		[
			5.66081,
			-34.0741,
			2.65
		],
		[
			5.99535,
			37.2126,
			2.65
		],
		[
			12.57312,
			-23.3968,
			2.65
		],
		[
			1.43027,
			60.2353,
			2.66
		],
		[
			13.91141,
			18.3977,
			2.68
		],
		[
			14.97553,
			-43.134,
			2.68
		],
		[
			4.94989,
			33.1661,
			2.69
		],
		[
			10.77949,
			-49.4203,
			2.69
		],
		[
			12.61973,
			-69.1356,
			2.69
		],
		[
			17.51273,
			-37.2958,
			2.7
		],
		[
			7.28571,
			-37.0975,
			2.71
		],
		[
			18.3499,
			-29.8281,
			2.72
		],
		[
			19.77099,
			10.6133,
			2.72
		],
		[
			16.23909,
			-3.6943,
			2.73
		],
		[
			16.39986,
			61.5142,
			2.73
		],
		[
			10.71595,
			-64.3945,
			2.74
		],
		[
			12.69435,
			-1.4494,
			2.74
		],
		[
			5.59055,
			-5.9099,
			2.75
		],
		[
			13.34328,
			-36.7123,
			2.75
		],
		[
			14.84797,
			-16.0418,
			2.75
		],
		[
			17.72454,
			4.5673,
			2.76
		],
		[
			5.13083,
			-5.0864,
			2.78
		],
		[
			16.50367,
			21.4896,
			2.78
		],
		[
			17.24413,
			14.3903,
			2.78
		],
		[
			12.25242,
			-58.7489,
			2.79
		],
		[
			17.50721,
			52.3014,
			2.79
		],
		[
			15.58568,
			-41.1668,
			2.8
		],
		[
			5.47075,
			-20.7594,
			2.81
		],
		[
			16.6881,
			31.6027,
			2.81
		],
		[
			.42919,
			-77.2542,
			2.82
		],
		[
			16.59804,
			-28.216,
			2.82
		],
		[
			18.46618,
			-25.4217,
			2.82
		],
		[
			.2206,
			15.1836,
			2.83
		],
		[
			8.12573,
			-24.3043,
			2.83
		],
		[
			15.91905,
			-63.4307,
			2.83
		],
		[
			3.9022,
			31.8836,
			2.84
		],
		[
			17.42167,
			-55.5299,
			2.84
		],
		[
			17.53069,
			-49.8761,
			2.84
		],
		[
			3.79141,
			24.1051,
			2.85
		],
		[
			13.03628,
			10.9592,
			2.85
		],
		[
			21.78401,
			-16.1273,
			2.85
		],
		[
			1.9795,
			-61.5699,
			2.86
		],
		[
			19.74958,
			45.1308,
			2.86
		],
		[
			6.38267,
			22.5136,
			2.87
		],
		[
			15.31516,
			-68.6795,
			2.87
		],
		[
			22.30836,
			-60.2596,
			2.87
		],
		[
			2.97102,
			-40.3047,
			2.88
		],
		[
			19.16273,
			-21.0236,
			2.88
		],
		[
			7.45251,
			8.2893,
			2.89
		],
		[
			12.93379,
			38.3184,
			2.89
		],
		[
			15.98087,
			-26.1141,
			2.89
		],
		[
			3.96423,
			40.0102,
			2.9
		],
		[
			16.35315,
			-25.5928,
			2.9
		],
		[
			21.52598,
			-5.5712,
			2.9
		],
		[
			3.07994,
			53.5064,
			2.91
		],
		[
			9.78503,
			-65.072,
			2.92
		],
		[
			22.71671,
			30.2212,
			2.93
		],
		[
			6.83227,
			-50.6146,
			2.94
		],
		[
			12.49774,
			-16.5154,
			2.94
		],
		[
			22.0964,
			-.3199,
			2.95
		],
		[
			3.96716,
			-13.5085,
			2.97
		],
		[
			5.62741,
			21.1425,
			2.97
		],
		[
			9.76419,
			23.7743,
			2.97
		],
		[
			18.0968,
			-30.4241,
			2.98
		],
		[
			13.31536,
			-23.1715,
			2.99
		],
		[
			17.79308,
			-40.127,
			2.99
		],
		[
			19.09017,
			13.8635,
			2.99
		],
		[
			2.15906,
			34.9873,
			3
		],
		[
			11.16106,
			44.4985,
			3
		],
		[
			15.34547,
			71.834,
			3
		],
		[
			16.86451,
			-38.0474,
			3
		],
		[
			21.89881,
			-37.3649,
			3
		],
		[
			3.71542,
			47.7876,
			3.01
		],
		[
			6.33855,
			-30.0634,
			3.02
		],
		[
			7.05041,
			-23.8333,
			3.02
		],
		[
			12.16875,
			-22.6198,
			3.02
		],
		[
			5.03281,
			43.8233,
			3.03
		],
		[
			12.77133,
			-68.1081,
			3.04
		],
		[
			14.53463,
			38.3083,
			3.04
		],
		[
			19.51202,
			27.9597,
			3.05
		],
		[
			20.35019,
			-14.7814,
			3.05
		],
		[
			6.7322,
			25.1311,
			3.06
		],
		[
			10.37215,
			41.4995,
			3.06
		],
		[
			19.20925,
			67.6615,
			3.07
		],
		[
			18.29379,
			-36.7617,
			3.1
		],
		[
			8.92323,
			5.9456,
			3.11
		],
		[
			10.82708,
			-16.1936,
			3.11
		],
		[
			11.59636,
			-63.0198,
			3.11
		],
		[
			20.62612,
			-47.2915,
			3.11
		],
		[
			5.84933,
			-35.7683,
			3.12
		],
		[
			8.98679,
			48.0418,
			3.12
		],
		[
			16.977,
			-55.9901,
			3.12
		],
		[
			17.25053,
			24.8392,
			3.12
		],
		[
			14.98603,
			-42.1042,
			3.13
		],
		[
			9.35092,
			34.3926,
			3.14
		],
		[
			9.52037,
			-57.0344,
			3.16
		],
		[
			17.25079,
			36.8092,
			3.16
		],
		[
			6.62935,
			-43.1959,
			3.17
		],
		[
			9.54762,
			51.6773,
			3.17
		],
		[
			17.14644,
			65.7147,
			3.17
		],
		[
			18.76094,
			-26.9908,
			3.17
		],
		[
			5.10858,
			41.2345,
			3.18
		],
		[
			14.70845,
			-64.9751,
			3.18
		],
		[
			4.83067,
			6.9613,
			3.19
		],
		[
			5.09102,
			-22.371,
			3.19
		],
		[
			16.96114,
			9.375,
			3.19
		],
		[
			17.83097,
			-37.0433,
			3.19
		],
		[
			21.21561,
			30.2269,
			3.21
		],
		[
			23.65579,
			77.6323,
			3.21
		],
		[
			15.3562,
			-40.6475,
			3.22
		],
		[
			16.30536,
			-4.6925,
			3.23
		],
		[
			18.35517,
			-2.8988,
			3.23
		],
		[
			21.47767,
			70.5607,
			3.23
		],
		[
			6.80318,
			-61.9414,
			3.24
		],
		[
			20.18841,
			-.8215,
			3.24
		],
		[
			7.48717,
			-43.3014,
			3.25
		],
		[
			14.10619,
			-26.6824,
			3.25
		],
		[
			15.06784,
			-25.282,
			3.25
		],
		[
			18.98239,
			32.6896,
			3.25
		],
		[
			3.78732,
			-74.239,
			3.26
		],
		[
			.65547,
			30.861,
			3.27
		],
		[
			17.36683,
			-24.9995,
			3.27
		],
		[
			22.91084,
			-15.8208,
			3.27
		],
		[
			5.21553,
			-16.2055,
			3.29
		],
		[
			10.22895,
			-70.0379,
			3.29
		],
		[
			15.41549,
			58.9661,
			3.29
		],
		[
			4.56661,
			-55.045,
			3.3
		],
		[
			10.53374,
			-61.6853,
			3.3
		],
		[
			6.24796,
			22.5068,
			3.31
		],
		[
			17.42324,
			-56.3777,
			3.31
		],
		[
			1.1014,
			-46.7184,
			3.32
		],
		[
			3.08627,
			38.8403,
			3.32
		],
		[
			12.2571,
			57.0326,
			3.32
		],
		[
			17.20255,
			-43.2392,
			3.32
		],
		[
			17.98377,
			-9.7736,
			3.32
		],
		[
			19.11567,
			-27.6704,
			3.32
		],
		[
			4.24041,
			-62.4739,
			3.33
		],
		[
			11.23733,
			15.4296,
			3.33
		],
		[
			7.82157,
			-24.8598,
			3.34
		],
		[
			1.90659,
			63.6701,
			3.35
		],
		[
			5.40795,
			-2.3971,
			3.35
		],
		[
			6.75483,
			12.8956,
			3.35
		],
		[
			8.50441,
			60.7182,
			3.35
		],
		[
			19.42497,
			3.1148,
			3.36
		],
		[
			15.37802,
			-44.6896,
			3.37
		],
		[
			8.77959,
			6.4188,
			3.38
		],
		[
			13.57822,
			-.5958,
			3.38
		],
		[
			5.58563,
			9.9342,
			3.39
		],
		[
			10.28471,
			-61.3323,
			3.39
		],
		[
			12.92673,
			3.3975,
			3.39
		],
		[
			22.18091,
			58.2013,
			3.39
		],
		[
			4.47771,
			15.8709,
			3.4
		],
		[
			1.47276,
			-43.3182,
			3.41
		],
		[
			4.01134,
			12.4903,
			3.41
		],
		[
			13.82508,
			-41.6877,
			3.41
		],
		[
			15.20475,
			-52.0992,
			3.41
		],
		[
			20.75483,
			61.8388,
			3.41
		],
		[
			22.69103,
			10.8314,
			3.41
		],
		[
			1.88469,
			29.5788,
			3.42
		],
		[
			16.00203,
			-38.3967,
			3.42
		],
		[
			17.77431,
			27.7207,
			3.42
		],
		[
			20.74931,
			-66.2032,
			3.42
		],
		[
			9.1828,
			-58.9669,
			3.43
		],
		[
			10.27817,
			23.4173,
			3.43
		],
		[
			19.10415,
			-4.8826,
			3.43
		],
		[
			10.28494,
			42.9144,
			3.45
		],
		[
			.81841,
			57.8152,
			3.46
		],
		[
			1.14317,
			-10.1823,
			3.46
		],
		[
			7.94631,
			-52.9824,
			3.46
		],
		[
			15.25838,
			33.3148,
			3.46
		],
		[
			2.72168,
			3.2358,
			3.47
		],
		[
			13.82694,
			-42.4737,
			3.47
		],
		[
			10.12221,
			16.7627,
			3.48
		],
		[
			16.71493,
			38.9223,
			3.48
		],
		[
			1.73447,
			-15.9375,
			3.49
		],
		[
			7.02865,
			-27.9348,
			3.49
		],
		[
			11.30798,
			33.0943,
			3.49
		],
		[
			15.03243,
			40.3906,
			3.49
		],
		[
			18.44956,
			-45.9685,
			3.49
		],
		[
			22.80925,
			-51.3169,
			3.49
		],
		[
			6.83068,
			-32.5085,
			3.5
		],
		[
			7.33538,
			21.9823,
			3.5
		],
		[
			22.82801,
			66.2004,
			3.5
		],
		[
			19.97929,
			19.4921,
			3.51
		],
		[
			22.83339,
			24.6016,
			3.51
		],
		[
			3.72081,
			-9.7634,
			3.52
		],
		[
			9.68584,
			9.8923,
			3.52
		],
		[
			9.94771,
			-54.5678,
			3.52
		],
		[
			18.83467,
			33.3627,
			3.52
		],
		[
			18.96217,
			-21.1067,
			3.52
		],
		[
			22.16999,
			6.1979,
			3.52
		],
		[
			4.47695,
			19.1804,
			3.53
		],
		[
			8.27525,
			9.1855,
			3.53
		],
		[
			11.55003,
			-31.8576,
			3.54
		],
		[
			15.827,
			-3.4302,
			3.54
		],
		[
			17.62645,
			-15.3986,
			3.54
		],
		[
			4.29824,
			-33.7983,
			3.55
		],
		[
			5.78259,
			-14.822,
			3.55
		],
		[
			14.32339,
			-46.0581,
			3.55
		],
		[
			18.35094,
			72.7328,
			3.55
		],
		[
			20.14545,
			-66.1821,
			3.55
		],
		[
			.3238,
			-8.8239,
			3.56
		],
		[
			2.27516,
			-51.5122,
			3.56
		],
		[
			11.32235,
			-14.7785,
			3.56
		],
		[
			16.87226,
			-38.0175,
			3.56
		],
		[
			7.74079,
			24.398,
			3.57
		],
		[
			9.06043,
			47.1565,
			3.57
		],
		[
			14.5305,
			30.3714,
			3.57
		],
		[
			15.36343,
			-36.2614,
			3.57
		],
		[
			7.30155,
			16.5404,
			3.58
		],
		[
			20.30091,
			-12.5449,
			3.58
		],
		[
			1.63321,
			48.6282,
			3.59
		],
		[
			5.29344,
			-6.8444,
			3.59
		],
		[
			5.74105,
			-22.4484,
			3.59
		],
		[
			11.84492,
			1.7647,
			3.59
		],
		[
			12.356,
			-60.4011,
			3.59
		],
		[
			1.40039,
			-8.1833,
			3.6
		],
		[
			6.87981,
			33.9613,
			3.6
		],
		[
			8.67155,
			-52.9219,
			3.6
		],
		[
			9.51167,
			-40.4668,
			3.6
		],
		[
			15.61707,
			-28.1351,
			3.6
		],
		[
			17.51831,
			-60.6838,
			3.6
		],
		[
			2.83307,
			27.2605,
			3.61
		],
		[
			3.41355,
			9.0289,
			3.61
		],
		[
			10.17647,
			-12.3541,
			3.61
		],
		[
			13.03785,
			-71.5489,
			3.61
		],
		[
			17.76222,
			-64.7239,
			3.61
		],
		[
			1.52473,
			15.3458,
			3.62
		],
		[
			3.81937,
			24.0534,
			3.62
		],
		[
			7.75425,
			-37.9686,
			3.62
		],
		[
			16.90973,
			-42.3613,
			3.62
		],
		[
			23.03202,
			42.326,
			3.62
		],
		[
			11.76011,
			-66.7288,
			3.63
		],
		[
			20.62582,
			14.5951,
			3.64
		],
		[
			4.32989,
			15.6276,
			3.65
		],
		[
			9.52547,
			63.0619,
			3.65
		],
		[
			15.76979,
			15.4218,
			3.65
		],
		[
			18.11052,
			-50.0915,
			3.65
		],
		[
			22.48053,
			-.02,
			3.65
		],
		[
			15.46381,
			29.1057,
			3.66
		],
		[
			15.64427,
			-29.7778,
			3.66
		],
		[
			14.07315,
			64.3759,
			3.67
		],
		[
			20.9135,
			-58.4542,
			3.67
		],
		[
			4.85343,
			5.6051,
			3.68
		],
		[
			8.72654,
			-33.1864,
			3.68
		],
		[
			19.78979,
			18.5343,
			3.68
		],
		[
			23.15745,
			-21.1724,
			3.68
		],
		[
			.61619,
			53.8969,
			3.69
		],
		[
			1.93263,
			-51.6089,
			3.69
		],
		[
			5.0413,
			41.0758,
			3.69
		],
		[
			9.75411,
			-62.5079,
			3.69
		],
		[
			11.76751,
			47.7794,
			3.69
		],
		[
			21.66818,
			-16.6623,
			3.69
		],
		[
			3.32528,
			-21.7579,
			3.7
		],
		[
			17.96275,
			29.2479,
			3.7
		],
		[
			23.28609,
			3.2823,
			3.7
		],
		[
			4.90419,
			2.4407,
			3.71
		],
		[
			5.94008,
			-14.1677,
			3.71
		],
		[
			7.87029,
			-40.5758,
			3.71
		],
		[
			15.84693,
			4.4777,
			3.71
		],
		[
			18.12249,
			9.5638,
			3.71
		],
		[
			19.92189,
			6.4068,
			3.71
		],
		[
			3.54885,
			-9.4583,
			3.72
		],
		[
			3.74793,
			24.1133,
			3.72
		],
		[
			5.99212,
			54.2847,
			3.72
		],
		[
			21.08219,
			43.9279,
			3.72
		],
		[
			3.45282,
			9.7327,
			3.73
		],
		[
			14.77081,
			1.8929,
			3.73
		],
		[
			17.89215,
			56.8726,
			3.73
		],
		[
			21.69129,
			-77.39,
			3.73
		],
		[
			22.87691,
			-7.5796,
			3.73
		],
		[
			1.85767,
			-10.335,
			3.74
		],
		[
			16.36534,
			19.1531,
			3.74
		],
		[
			21.24653,
			38.0453,
			3.74
		],
		[
			9.06925,
			-47.0977,
			3.75
		],
		[
			17.79821,
			2.7073,
			3.75
		],
		[
			5.56042,
			-62.4898,
			3.76
		],
		[
			5.85536,
			-20.8791,
			3.76
		],
		[
			6.4803,
			-7.0331,
			3.76
		],
		[
			19.07805,
			-21.7415,
			3.76
		],
		[
			19.4951,
			51.7298,
			3.76
		],
		[
			22.52153,
			50.2825,
			3.76
		],
		[
			2.84495,
			55.8955,
			3.77
		],
		[
			3.75323,
			42.5785,
			3.77
		],
		[
			4.38225,
			17.5425,
			3.77
		],
		[
			5.64577,
			-2.6001,
			3.77
		],
		[
			8.42894,
			-66.1369,
			3.77
		],
		[
			8.6771,
			-46.6487,
			3.77
		],
		[
			16.82977,
			-59.0414,
			3.77
		],
		[
			20.66063,
			15.9121,
			3.77
		],
		[
			21.44445,
			-22.4113,
			3.77
		],
		[
			22.11685,
			25.3451,
			3.77
		],
		[
			7.14579,
			-70.4989,
			3.78
		],
		[
			7.42878,
			27.7981,
			3.78
		],
		[
			9.84982,
			59.0387,
			3.78
		],
		[
			10.89157,
			-58.8532,
			3.78
		],
		[
			14.68582,
			13.7283,
			3.78
		],
		[
			20.7946,
			-9.4958,
			3.78
		],
		[
			3.15827,
			44.8575,
			3.79
		],
		[
			10.88853,
			34.2149,
			3.79
		],
		[
			11.30312,
			31.5308,
			3.79
		],
		[
			3.20126,
			-28.9876,
			3.8
		],
		[
			7.64719,
			-26.8038,
			3.8
		],
		[
			15.58004,
			10.5389,
			3.8
		],
		[
			19.28505,
			53.3685,
			3.8
		],
		[
			20.22719,
			46.7413,
			3.8
		],
		[
			4.59251,
			-30.5623,
			3.81
		],
		[
			10.46465,
			-58.7394,
			3.81
		],
		[
			15.71238,
			26.2956,
			3.81
		],
		[
			23.62607,
			46.4582,
			3.81
		],
		[
			2.03412,
			2.7638,
			3.82
		],
		[
			9.31407,
			36.8026,
			3.82
		],
		[
			11.52339,
			69.3311,
			3.82
		],
		[
			16.51523,
			1.9839,
			3.82
		],
		[
			17.65775,
			46.0063,
			3.82
		],
		[
			10.43484,
			-16.8363,
			3.83
		],
		[
			13.97119,
			-42.1008,
			3.83
		],
		[
			14.7977,
			-79.0448,
			3.83
		],
		[
			3.73666,
			-64.8069,
			3.84
		],
		[
			3.73865,
			32.2882,
			3.84
		],
		[
			4.47625,
			15.9622,
			3.84
		],
		[
			8.91745,
			-60.6446,
			3.84
		],
		[
			10.54685,
			9.3066,
			3.84
		],
		[
			10.62171,
			-48.2256,
			3.84
		],
		[
			12.54111,
			-72.133,
			3.84
		],
		[
			18.12571,
			28.7625,
			3.84
		],
		[
			18.22939,
			-21.0588,
			3.84
		],
		[
			19.80287,
			70.2679,
			3.84
		],
		[
			4.23337,
			-42.2944,
			3.85
		],
		[
			5.78808,
			-51.0665,
			3.85
		],
		[
			6.36857,
			-33.4364,
			3.85
		],
		[
			10.2456,
			-42.1219,
			3.85
		],
		[
			12.55804,
			69.7882,
			3.85
		],
		[
			12.62838,
			-48.5413,
			3.85
		],
		[
			15.94089,
			15.6616,
			3.85
		],
		[
			18.39497,
			21.7698,
			3.85
		],
		[
			18.58679,
			-8.2441,
			3.85
		],
		[
			.94589,
			38.4993,
			3.86
		],
		[
			4.63634,
			-14.304,
			3.86
		],
		[
			5.52021,
			-35.4705,
			3.86
		],
		[
			16.2573,
			-63.6857,
			3.86
		],
		[
			16.55752,
			-78.8971,
			3.86
		],
		[
			17.93755,
			37.2505,
			3.86
		],
		[
			22.36094,
			-1.3873,
			3.86
		],
		[
			3.76378,
			24.3677,
			3.87
		],
		[
			8.76713,
			-46.0415,
			3.87
		],
		[
			13.97799,
			-44.8036,
			3.87
		],
		[
			14.71767,
			-5.6582,
			3.87
		],
		[
			15.94808,
			-29.2141,
			3.87
		],
		[
			19.87455,
			1.0057,
			3.87
		],
		[
			.15685,
			-45.7474,
			3.88
		],
		[
			1.89217,
			19.2939,
			3.88
		],
		[
			9.87939,
			26.007,
			3.88
		],
		[
			15.19891,
			-48.7378,
			3.88
		],
		[
			23.17265,
			-45.2467,
			3.88
		],
		[
			2.94046,
			-8.8981,
			3.89
		],
		[
			6.90221,
			-24.1842,
			3.89
		],
		[
			9.23941,
			2.3143,
			3.89
		],
		[
			12.33177,
			-.6668,
			3.89
		],
		[
			19.93843,
			35.0834,
			3.89
		],
		[
			9.66427,
			-1.1428,
			3.9
		],
		[
			11.35011,
			-54.491,
			3.9
		],
		[
			13.51741,
			-39.4073,
			3.9
		],
		[
			4.05261,
			5.9893,
			3.91
		],
		[
			8.42767,
			-3.9064,
			3.91
		],
		[
			12.46733,
			-50.2306,
			3.91
		],
		[
			15.0853,
			-47.0512,
			3.91
		],
		[
			15.59211,
			-14.7895,
			3.91
		],
		[
			16.32901,
			46.3134,
			3.91
		],
		[
			17.00483,
			30.9264,
			3.92
		],
		[
			19.36121,
			-17.8472,
			3.92
		],
		[
			21.26373,
			5.2478,
			3.92
		],
		[
			.43672,
			-43.6798,
			3.93
		],
		[
			1.52086,
			-49.0727,
			3.93
		],
		[
			2.90429,
			52.7625,
			3.93
		],
		[
			4.60532,
			-3.3525,
			3.93
		],
		[
			7.69702,
			-72.6061,
			3.93
		],
		[
			11.14317,
			-58.975,
			3.93
		],
		[
			16.11345,
			-20.6692,
			3.93
		],
		[
			18.01075,
			2.9316,
			3.93
		],
		[
			1.13975,
			-55.2458,
			3.94
		],
		[
			7.68745,
			-9.5511,
			3.94
		],
		[
			7.73013,
			-28.9548,
			3.94
		],
		[
			8.74475,
			18.1543,
			3.94
		],
		[
			20.95289,
			41.1671,
			3.94
		],
		[
			2.05725,
			72.4213,
			3.95
		],
		[
			6.6114,
			-19.2559,
			3.95
		],
		[
			4.14436,
			47.7125,
			3.96
		],
		[
			5.98578,
			-42.8151,
			3.96
		],
		[
			9.01066,
			41.7829,
			3.96
		],
		[
			9.18798,
			-62.317,
			3.96
		],
		[
			19.37731,
			-44.459,
			3.96
		],
		[
			19.39811,
			-40.6159,
			3.96
		],
		[
			20.25787,
			47.7142,
			3.96
		],
		[
			23.38284,
			-20.1006,
			3.96
		],
		[
			4.40061,
			-34.0168,
			3.97
		],
		[
			5.85817,
			39.1485,
			3.97
		],
		[
			7.28051,
			-67.9572,
			3.97
		],
		[
			8.66837,
			-35.3084,
			3.97
		],
		[
			12.1942,
			-52.3685,
			3.97
		],
		[
			15.84931,
			-33.6272,
			3.97
		],
		[
			20.00987,
			-72.9105,
			3.97
		],
		[
			22.48783,
			-43.4956,
			3.97
		],
		[
			22.77552,
			23.5657,
			3.97
		],
		[
			3.98275,
			35.791,
			3.98
		],
		[
			21.56635,
			45.5918,
			3.98
		],
		[
			2.00009,
			-21.0778,
			3.99
		],
		[
			6.24759,
			-6.2748,
			3.99
		],
		[
			10.40659,
			-74.0316,
			3.99
		],
		[
			13.42043,
			54.988,
			3.99
		],
		[
			23.29049,
			-58.2357,
			3.99
		],
		[
			9.04077,
			-66.3961,
			4
		],
		[
			11.39874,
			10.5295,
			4
		],
		[
			16.19993,
			-19.4607,
			4
		],
		[
			1.72768,
			50.6887,
			4.01
		],
		[
			4.75837,
			-3.2547,
			4.01
		],
		[
			7.06848,
			20.5703,
			4.01
		],
		[
			7.24685,
			-26.7727,
			4.01
		],
		[
			14.69933,
			-37.7935,
			4.01
		],
		[
			16.03149,
			58.5653,
			4.01
		],
		[
			16.33067,
			-50.1555,
			4.01
		],
		[
			18.71726,
			-71.4281,
			4.01
		],
		[
			20.48993,
			30.3686,
			4.01
		],
		[
			8.8422,
			-27.7098,
			4.02
		],
		[
			12.14023,
			-24.7289,
			4.02
		],
		[
			18.99371,
			15.0683,
			4.02
		],
		[
			19.02801,
			-5.7391,
			4.02
		],
		[
			2.28857,
			33.8472,
			4.03
		],
		[
			5.05697,
			60.4422,
			4.03
		],
		[
			8.77829,
			28.7599,
			4.03
		],
		[
			12.90989,
			-57.1779,
			4.03
		],
		[
			18.09091,
			2.5001,
			4.03
		],
		[
			20.55355,
			11.3033,
			4.03
		],
		[
			23.98853,
			6.8633,
			4.03
		],
		[
			4.19776,
			-6.8376,
			4.04
		],
		[
			11.76432,
			6.5294,
			4.04
		],
		[
			14.41995,
			51.8507,
			4.04
		],
		[
			22.58927,
			-.1175,
			4.04
		],
		[
			3.15111,
			49.6133,
			4.05
		],
		[
			8.30877,
			-76.9197,
			4.05
		],
		[
			8.73999,
			-42.6493,
			4.05
		],
		[
			11.35227,
			6.0293,
			4.05
		],
		[
			13.82462,
			15.7979,
			4.05
		],
		[
			14.34262,
			-37.8853,
			4.05
		],
		[
			14.63145,
			-49.4258,
			4.05
		],
		[
			22.82653,
			-13.5926,
			4.05
		],
		[
			4.93952,
			13.5145,
			4.06
		],
		[
			7.59871,
			26.8957,
			4.06
		],
		[
			11.4147,
			-17.684,
			4.06
		],
		[
			12.29285,
			-67.9607,
			4.06
		],
		[
			12.30729,
			-64.0031,
			4.06
		],
		[
			14.72762,
			-35.1737,
			4.06
		],
		[
			16.99307,
			-53.1604,
			4.06
		],
		[
			14.26691,
			-6.0005,
			4.07
		],
		[
			15.14739,
			-45.2799,
			4.07
		],
		[
			15.2919,
			-58.8012,
			4.07
		],
		[
			22.48619,
			58.4152,
			4.07
		],
		[
			.78898,
			24.2672,
			4.08
		],
		[
			2.36249,
			-68.6594,
			4.08
		],
		[
			2.65805,
			.3285,
			4.08
		],
		[
			3.03986,
			-23.6245,
			4.08
		],
		[
			6.90317,
			-12.0386,
			4.08
		],
		[
			9.57407,
			-59.2298,
			4.08
		],
		[
			10.99624,
			-18.2988,
			4.08
		],
		[
			18.92225,
			43.9461,
			4.08
		],
		[
			21.09912,
			-17.2329,
			4.08
		],
		[
			21.36811,
			19.8045,
			4.08
		],
		[
			5.61511,
			9.2907,
			4.09
		],
		[
			15.81233,
			18.1416,
			4.09
		],
		[
			1.61329,
			41.4055,
			4.1
		],
		[
			2.73666,
			49.2284,
			4.1
		],
		[
			7.82064,
			-46.3732,
			4.1
		],
		[
			18.48051,
			-49.0706,
			4.1
		],
		[
			19.16715,
			-39.3408,
			4.1
		],
		[
			2.67779,
			-39.8554,
			4.11
		],
		[
			7.06264,
			-15.6333,
			4.11
		],
		[
			8.6274,
			-42.9891,
			4.11
		],
		[
			9.85797,
			-14.8466,
			4.11
		],
		[
			10.59114,
			-78.6078,
			4.11
		],
		[
			11.77523,
			-61.1784,
			4.11
		],
		[
			15.61201,
			-66.317,
			4.11
		],
		[
			19.15787,
			-37.9045,
			4.11
		],
		[
			23.01467,
			-52.7541,
			4.11
		],
		[
			2.65982,
			-68.2669,
			4.12
		],
		[
			4.24829,
			48.4093,
			4.12
		],
		[
			6.03972,
			9.6473,
			4.12
		],
		[
			12.08681,
			8.733,
			4.12
		],
		[
			19.92103,
			-41.8683,
			4.12
		],
		[
			20.86369,
			-26.9191,
			4.12
		],
		[
			22.49595,
			-43.7492,
			4.12
		],
		[
			5.39912,
			-7.8081,
			4.13
		],
		[
			6.48272,
			20.2121,
			4.13
		],
		[
			15.89709,
			-16.7293,
			4.13
		],
		[
			20.76826,
			-25.2709,
			4.13
		],
		[
			22.76764,
			-81.3816,
			4.13
		],
		[
			23.66585,
			5.6263,
			4.13
		],
		[
			3.51455,
			12.9367,
			4.14
		],
		[
			3.77211,
			23.9484,
			4.14
		],
		[
			8.6276,
			5.7038,
			4.14
		],
		[
			12.11469,
			-64.6137,
			4.14
		],
		[
			15.54883,
			31.3591,
			4.14
		],
		[
			15.95979,
			26.8779,
			4.14
		],
		[
			21.74409,
			25.645,
			4.14
		],
		[
			22.26616,
			37.7487,
			4.14
		],
		[
			7.19774,
			-.4928,
			4.15
		],
		[
			17.39471,
			37.1459,
			4.15
		],
		[
			23.67347,
			44.3339,
			4.15
		],
		[
			6.06867,
			23.2633,
			4.16
		],
		[
			7.4852,
			31.7846,
			4.16
		],
		[
			16.07267,
			-11.3736,
			4.16
		],
		[
			17.43951,
			-24.1753,
			4.16
		],
		[
			.55,
			62.9318,
			4.17
		],
		[
			3.82423,
			-36.2003,
			4.17
		],
		[
			22.28057,
			-7.7833,
			4.17
		],
		[
			14.21493,
			-10.2737,
			4.18
		],
		[
			14.27306,
			46.0883,
			4.18
		],
		[
			16.60624,
			-35.2553,
			4.18
		],
		[
			22.25061,
			57.0436,
			4.18
		],
		[
			22.67759,
			-27.0436,
			4.18
		],
		[
			13.82409,
			-34.4508,
			4.19
		],
		[
			18.76103,
			20.5463,
			4.19
		],
		[
			5.51307,
			5.9481,
			4.2
		],
		[
			7.94765,
			-22.8801,
			4.2
		],
		[
			10.46472,
			36.7072,
			4.2
		],
		[
			16.56839,
			42.437,
			4.2
		],
		[
			22.77822,
			12.1729,
			4.2
		],
		[
			22.93247,
			-32.5396,
			4.2
		],
		[
			3.48448,
			59.9403,
			4.21
		],
		[
			4.42283,
			22.2939,
			4.21
		],
		[
			16.76618,
			82.0373,
			4.21
		],
		[
			20.49303,
			62.9941,
			4.21
		],
		[
			21.44073,
			-65.3662,
			4.21
		],
		[
			2.84307,
			38.3186,
			4.22
		],
		[
			3.7808,
			-23.2497,
			4.22
		],
		[
			7.88838,
			-48.1029,
			4.22
		],
		[
			16.10987,
			-36.8023,
			4.22
		],
		[
			16.4504,
			-18.4563,
			4.22
		],
		[
			18.34595,
			71.3378,
			4.22
		],
		[
			18.78624,
			-4.7479,
			4.22
		],
		[
			18.87029,
			-62.1876,
			4.22
		],
		[
			18.90841,
			36.8986,
			4.22
		],
		[
			20.76104,
			30.7197,
			4.22
		],
		[
			21.29027,
			39.3947,
			4.22
		],
		[
			23.23871,
			-6.049,
			4.22
		],
		[
			.33452,
			-64.8748,
			4.23
		],
		[
			7.72187,
			28.8835,
			4.23
		],
		[
			13.19789,
			27.8782,
			4.23
		],
		[
			13.76146,
			-33.0437,
			4.23
		],
		[
			14.02744,
			1.5445,
			4.23
		],
		[
			16.14616,
			44.9349,
			4.23
		],
		[
			16.71796,
			-77.5174,
			4.23
		],
		[
			19.10697,
			-37.0634,
			4.23
		],
		[
			21.72513,
			58.78,
			4.23
		],
		[
			21.77989,
			49.3096,
			4.23
		],
		[
			1.1458,
			86.2571,
			4.24
		],
		[
			2.44975,
			-47.7038,
			4.24
		],
		[
			2.73537,
			-13.8587,
			4.24
		],
		[
			12.30579,
			-79.3122,
			4.24
		],
		[
			12.56237,
			41.3575,
			4.24
		],
		[
			16.52304,
			-34.7044,
			4.24
		],
		[
			17.69024,
			-12.8753,
			4.24
		],
		[
			23.26486,
			-9.0877,
			4.24
		],
		[
			1.26282,
			-68.8759,
			4.25
		],
		[
			4.10973,
			50.3513,
			4.25
		],
		[
			4.59424,
			10.1608,
			4.25
		],
		[
			4.61151,
			41.2648,
			4.25
		],
		[
			5.15244,
			-8.7541,
			4.25
		],
		[
			8.38059,
			43.1881,
			4.25
		],
		[
			12.89061,
			-40.1789,
			4.25
		],
		[
			14.45876,
			75.696,
			4.25
		],
		[
			21.75748,
			61.1208,
			4.25
		],
		[
			1.15837,
			47.2418,
			4.26
		],
		[
			1.75657,
			9.1577,
			4.26
		],
		[
			3.33213,
			-43.0698,
			4.26
		],
		[
			3.56313,
			-21.6329,
			4.26
		],
		[
			4.26711,
			-51.4866,
			4.26
		],
		[
			4.90083,
			66.3427,
			4.26
		],
		[
			8.97479,
			11.8577,
			4.26
		],
		[
			17.60912,
			-38.6353,
			4.26
		],
		[
			18.02511,
			21.5958,
			4.26
		],
		[
			22.06318,
			64.628,
			4.26
		],
		[
			1.04906,
			7.8901,
			4.27
		],
		[
			2.74904,
			10.1141,
			4.27
		],
		[
			4.25891,
			8.8924,
			4.27
		],
		[
			4.63596,
			12.5108,
			4.27
		],
		[
			4.70409,
			22.9569,
			4.27
		],
		[
			13.11518,
			-49.9062,
			4.27
		],
		[
			15.30889,
			-47.8753,
			4.27
		],
		[
			19.38698,
			-44.7998,
			4.27
		],
		[
			20.77764,
			16.1243,
			4.27
		],
		[
			23.46614,
			6.379,
			4.27
		],
		[
			4.43846,
			22.8136,
			4.28
		],
		[
			9.61813,
			81.3264,
			4.28
		],
		[
			10.45253,
			-31.0678,
			4.28
		],
		[
			17.45591,
			-29.867,
			4.28
		],
		[
			20.22329,
			56.5677,
			4.28
		],
		[
			21.37078,
			-16.8345,
			4.28
		],
		[
			22.16646,
			33.1782,
			4.28
		],
		[
			23.11465,
			-43.5204,
			4.28
		],
		[
			3.61455,
			.4017,
			4.29
		],
		[
			5.32626,
			-13.1768,
			4.29
		],
		[
			10.65511,
			-55.6033,
			4.29
		],
		[
			11.88181,
			-33.9081,
			4.29
		],
		[
			15.73431,
			77.7945,
			4.29
		],
		[
			16.51899,
			-16.6127,
			4.29
		],
		[
			22.10729,
			-13.8697,
			4.29
		],
		[
			22.52509,
			-32.3461,
			4.29
		],
		[
			23.63561,
			43.2681,
			4.29
		],
		[
			.97677,
			-29.3574,
			4.3
		],
		[
			2.46932,
			8.4601,
			4.3
		],
		[
			3.75347,
			24.4673,
			4.3
		],
		[
			3.80997,
			-37.6202,
			4.3
		],
		[
			4.42483,
			17.9279,
			4.3
		],
		[
			5.99891,
			45.9367,
			4.3
		],
		[
			8.72041,
			3.3987,
			4.3
		],
		[
			10.92689,
			24.7497,
			4.3
		],
		[
			11.61581,
			-.8237,
			4.3
		],
		[
			11.82807,
			-63.7885,
			4.3
		],
		[
			12.53451,
			-16.196,
			4.3
		],
		[
			14.33876,
			-56.3865,
			4.3
		],
		[
			20.29413,
			-12.5082,
			4.3
		],
		[
			8.67695,
			-59.761,
			4.31
		],
		[
			14.44867,
			-83.6679,
			4.31
		],
		[
			15.40817,
			37.3772,
			4.31
		],
		[
			16.12343,
			-20.8688,
			4.31
		],
		[
			20.63897,
			-1.1051,
			4.31
		],
		[
			3.60816,
			48.1926,
			4.32
		],
		[
			4.67403,
			-19.6715,
			4.32
		],
		[
			5.53687,
			18.5942,
			4.32
		],
		[
			6.2563,
			29.4981,
			4.32
		],
		[
			8.77293,
			-13.5477,
			4.32
		],
		[
			9.52867,
			22.968,
			4.32
		],
		[
			12.05042,
			-63.3129,
			4.32
		],
		[
			13.16647,
			17.5294,
			4.32
		],
		[
			13.86378,
			-32.9941,
			4.32
		],
		[
			14.86064,
			-43.5754,
			4.32
		],
		[
			17.34713,
			-12.8469,
			4.32
		],
		[
			7.46939,
			8.9255,
			4.33
		],
		[
			12.88525,
			-48.9433,
			4.33
		],
		[
			14.43634,
			-45.3793,
			4.33
		],
		[
			17.25583,
			-26.6028,
			4.33
		],
		[
			18.14301,
			-63.6686,
			4.33
		],
		[
			18.33103,
			36.0645,
			4.33
		],
		[
			.61468,
			33.7193,
			4.34
		],
		[
			.64259,
			29.3118,
			4.34
		],
		[
			1.18505,
			55.1499,
			4.34
		],
		[
			5.74621,
			-65.7355,
			4.34
		],
		[
			6.53093,
			-23.4184,
			4.34
		],
		[
			8.34404,
			-77.4845,
			4.34
		],
		[
			9.27002,
			-57.5415,
			4.34
		],
		[
			9.61376,
			-49.355,
			4.34
		],
		[
			14.02875,
			-45.6034,
			4.34
		],
		[
			15.63423,
			-42.5673,
			4.34
		],
		[
			17.44191,
			4.1404,
			4.34
		],
		[
			18.74621,
			37.6051,
			4.34
		],
		[
			18.78369,
			18.1815,
			4.34
		],
		[
			21.74186,
			17.35,
			4.34
		],
		[
			22.49217,
			47.7069,
			4.34
		],
		[
			3.19383,
			19.7267,
			4.35
		],
		[
			4.84353,
			8.9002,
			4.35
		],
		[
			6.58294,
			-52.9756,
			4.35
		],
		[
			6.95461,
			58.4228,
			4.35
		],
		[
			8.13217,
			-68.6171,
			4.35
		],
		[
			8.80721,
			5.8378,
			4.35
		],
		[
			12.44897,
			28.2684,
			4.35
		],
		[
			15.29718,
			-30.1487,
			4.35
		],
		[
			17.53695,
			86.5865,
			4.35
		],
		[
			18.38712,
			-61.4939,
			4.35
		],
		[
			19.27281,
			38.1337,
			4.35
		],
		[
			21.74911,
			-33.0258,
			4.35
		],
		[
			.52574,
			-62.9582,
			4.36
		],
		[
			.72257,
			-57.4631,
			4.36
		],
		[
			2.21667,
			8.8467,
			4.36
		],
		[
			3.50958,
			47.9952,
			4.36
		],
		[
			4.07825,
			22.0819,
			4.36
		],
		[
			4.88157,
			-5.4527,
			4.36
		],
		[
			5.22052,
			-12.9413,
			4.36
		],
		[
			5.95895,
			-35.2833,
			4.36
		],
		[
			6.93562,
			-17.0542,
			4.36
		],
		[
			8.14323,
			-2.9838,
			4.36
		],
		[
			14.10077,
			-41.1796,
			4.36
		],
		[
			19.61202,
			-1.2866,
			4.36
		],
		[
			.03267,
			-6.0141,
			4.37
		],
		[
			6.27587,
			-35.1405,
			4.37
		],
		[
			7.3118,
			-24.9544,
			4.37
		],
		[
			11.00257,
			-42.2259,
			4.37
		],
		[
			18.14597,
			20.8146,
			4.37
		],
		[
			19.99561,
			-35.2763,
			4.37
		],
		[
			13.16583,
			-5.539,
			4.38
		],
		[
			20.14815,
			77.7114,
			4.38
		],
		[
			23.43411,
			-20.642,
			4.38
		],
		[
			23.54951,
			-37.8183,
			4.38
		],
		[
			1.89409,
			-46.3027,
			4.39
		],
		[
			3.82535,
			65.526,
			4.39
		],
		[
			5.58035,
			9.4896,
			4.39
		],
		[
			5.90639,
			20.2762,
			4.39
		],
		[
			6.39613,
			4.5929,
			4.39
		],
		[
			8.03776,
			2.3346,
			4.39
		],
		[
			10.13174,
			9.9975,
			4.39
		],
		[
			15.04835,
			2.0913,
			4.39
		],
		[
			16.90013,
			10.1654,
			4.39
		],
		[
			17.35011,
			-21.1129,
			4.39
		],
		[
			19.66827,
			18.0139,
			4.39
		],
		[
			19.68415,
			17.476,
			4.39
		],
		[
			21.33111,
			-53.4494,
			4.39
		],
		[
			.95345,
			23.4176,
			4.4
		],
		[
			7.80143,
			-25.9372,
			4.4
		],
		[
			8.15045,
			-19.245,
			4.4
		],
		[
			18.94917,
			-67.2335,
			4.4
		],
		[
			21.9653,
			-54.9926,
			4.4
		],
		[
			6.83092,
			-53.6224,
			4.41
		],
		[
			7.18566,
			30.2452,
			4.41
		],
		[
			14.38395,
			-39.5118,
			4.41
		],
		[
			17.51231,
			26.1106,
			4.41
		],
		[
			17.97504,
			30.1893,
			4.41
		],
		[
			21.29863,
			34.8969,
			4.41
		],
		[
			23.13163,
			75.3875,
			4.41
		],
		[
			23.29839,
			-9.1825,
			4.41
		],
		[
			23.31373,
			-32.532,
			4.41
		],
		[
			6.1262,
			14.7685,
			4.42
		],
		[
			6.63151,
			-18.2375,
			4.42
		],
		[
			7.22565,
			-44.6397,
			4.42
		],
		[
			7.23756,
			-26.3525,
			4.42
		],
		[
			8.23415,
			-40.3479,
			4.42
		],
		[
			11.03883,
			20.1798,
			4.42
		],
		[
			14.83814,
			-27.9604,
			4.42
		],
		[
			15.77406,
			7.3531,
			4.42
		],
		[
			18.02922,
			1.3051,
			4.42
		],
		[
			22.39267,
			52.229,
			4.42
		],
		[
			23.42299,
			23.4041,
			4.42
		],
		[
			3.76904,
			-12.1016,
			4.43
		],
		[
			4.25453,
			-7.6529,
			4.43
		],
		[
			4.95478,
			53.7521,
			4.43
		],
		[
			19.2293,
			39.146,
			4.43
		],
		[
			20.0443,
			-27.7098,
			4.43
		],
		[
			20.39767,
			32.1902,
			4.43
		],
		[
			20.72431,
			15.0746,
			4.43
		],
		[
			20.79562,
			-5.0277,
			4.43
		],
		[
			.24401,
			-18.9329,
			4.44
		],
		[
			.81137,
			7.5851,
			4.44
		],
		[
			4.27473,
			-59.3022,
			4.44
		],
		[
			4.67603,
			-41.8638,
			4.44
		],
		[
			6.32705,
			59.011,
			4.44
		],
		[
			7.56755,
			-22.2961,
			4.44
		],
		[
			8.18931,
			-39.6185,
			4.44
		],
		[
			8.30925,
			-36.6593,
			4.44
		],
		[
			14.54363,
			-50.4572,
			4.44
		],
		[
			19.47843,
			24.6649,
			4.44
		],
		[
			1.69053,
			5.4876,
			4.45
		],
		[
			2.81817,
			-32.4059,
			4.45
		],
		[
			5.20497,
			-11.8692,
			4.45
		],
		[
			6.199,
			14.2088,
			4.45
		],
		[
			8.64595,
			3.3414,
			4.45
		],
		[
			9.0015,
			-41.2536,
			4.45
		],
		[
			10.59314,
			-57.5576,
			4.45
		],
		[
			10.76305,
			-80.5402,
			4.45
		],
		[
			11.27769,
			-3.6516,
			4.45
		],
		[
			16.53561,
			-21.4664,
			4.45
		],
		[
			19.25918,
			73.3555,
			4.45
		],
		[
			19.56815,
			7.3789,
			4.45
		],
		[
			2.48443,
			67.4025,
			4.46
		],
		[
			3.90486,
			-2.9547,
			4.46
		],
		[
			5.22152,
			2.8613,
			4.46
		],
		[
			9.14785,
			51.6046,
			4.46
		],
		[
			11.1943,
			-22.8258,
			4.46
		],
		[
			12.13479,
			-50.6613,
			4.46
		],
		[
			16.45307,
			-47.5548,
			4.46
		],
		[
			22.87543,
			-32.8755,
			4.46
		],
		[
			2.75172,
			-18.5726,
			4.47
		],
		[
			3.33899,
			29.0485,
			4.47
		],
		[
			4.97581,
			1.714,
			4.47
		],
		[
			6.4695,
			-32.5801,
			4.47
		],
		[
			6.54839,
			7.333,
			4.47
		],
		[
			7.97068,
			-49.2449,
			4.47
		],
		[
			9.08578,
			-72.6027,
			4.47
		],
		[
			9.41091,
			26.1823,
			4.47
		],
		[
			9.5804,
			52.0515,
			4.47
		],
		[
			11.85241,
			-45.1735,
			4.47
		],
		[
			14.57801,
			29.7451,
			4.47
		],
		[
			14.95305,
			-4.3465,
			4.47
		],
		[
			21.24134,
			10.007,
			4.47
		],
		[
			22.10191,
			-39.5434,
			4.47
		],
		[
			.74542,
			48.2844,
			4.48
		],
		[
			4.01495,
			-62.1593,
			4.48
		],
		[
			4.43909,
			15.6183,
			4.48
		],
		[
			6.79768,
			2.4122,
			4.48
		],
		[
			10.1323,
			-.3716,
			4.48
		],
		[
			15.38963,
			-59.3208,
			4.48
		],
		[
			16.40172,
			-20.0373,
			4.48
		],
		[
			23.06461,
			3.82,
			4.48
		],
		[
			23.11135,
			-23.7431,
			4.48
		],
		[
			2.03263,
			70.907,
			4.49
		],
		[
			4.55849,
			-29.7665,
			4.49
		],
		[
			6.73314,
			13.228,
			4.49
		],
		[
			7.20934,
			-46.7593,
			4.49
		],
		[
			7.8774,
			-38.8628,
			4.49
		],
		[
			10.12382,
			35.2447,
			4.49
		],
		[
			14.67877,
			16.4183,
			4.49
		],
		[
			19.60737,
			50.2211,
			4.49
		],
		[
			21.11879,
			-25.0059,
			4.49
		],
		[
			21.73571,
			28.7426,
			4.49
		],
		[
			23.70078,
			1.78,
			4.49
		],
		[
			23.71204,
			-14.5449,
			4.49
		],
		[
			23.99861,
			-65.5771,
			4.49
		],
		[
			5.65309,
			4.1215,
			4.5
		],
		[
			5.83046,
			-56.1667,
			4.5
		],
		[
			8.77849,
			-56.7698,
			4.5
		],
		[
			10.34855,
			-56.0432,
			4.5
		],
		[
			11.79976,
			20.2189,
			4.5
		],
		[
			13.78771,
			17.4569,
			4.5
		],
		[
			20.26281,
			27.8142,
			4.5
		],
		[
			21.1599,
			-11.3717,
			4.5
		],
		[
			21.47872,
			-21.8072,
			4.5
		],
		[
			22.13973,
			-32.9885,
			4.5
		],
		[
			22.23131,
			39.7149,
			4.5
		],
		[
			22.67524,
			44.2763,
			4.5
		],
		[
			.30546,
			36.7852,
			4.51
		],
		[
			1.19435,
			30.0896,
			4.51
		],
		[
			5.81957,
			39.1811,
			4.51
		],
		[
			9.48742,
			-35.9513,
			4.51
		],
		[
			9.65583,
			-61.3281,
			4.51
		],
		[
			15.69251,
			19.6704,
			4.51
		],
		[
			20.04697,
			67.8736,
			4.51
		],
		[
			20.73398,
			-51.921,
			4.51
		],
		[
			21.61801,
			-19.466,
			4.51
		],
		[
			22.45555,
			-64.9664,
			4.51
		],
		[
			23.9064,
			57.4994,
			4.51
		],
		[
			2.79849,
			29.2471,
			4.52
		],
		[
			13.37721,
			-60.9884,
			4.52
		],
		[
			13.40013,
			-64.5357,
			4.52
		],
		[
			14.3185,
			-13.3711,
			4.52
		],
		[
			15.07409,
			26.9476,
			4.52
		],
		[
			18.18715,
			-45.9544,
			4.52
		],
		[
			19.36212,
			-15.955,
			4.52
		],
		[
			20.75587,
			57.5797,
			4.52
		],
		[
			21.49914,
			23.6388,
			4.52
		],
		[
			22.50813,
			43.1234,
			4.52
		],
		[
			.52597,
			-62.9656,
			4.53
		],
		[
			.83023,
			41.0789,
			4.53
		],
		[
			6.00093,
			-3.0743,
			4.53
		],
		[
			7.62281,
			-34.9685,
			4.53
		],
		[
			14.22473,
			51.79,
			4.53
		],
		[
			17.44385,
			-5.0866,
			4.53
		],
		[
			17.79267,
			-27.8308,
			4.53
		],
		[
			20.79015,
			36.4907,
			4.53
		],
		[
			23.20917,
			49.4062,
			4.53
		],
		[
			5.30293,
			33.3716,
			4.54
		],
		[
			6.58427,
			-22.9648,
			4.54
		],
		[
			9.53303,
			-1.1847,
			4.54
		],
		[
			9.57039,
			36.3976,
			4.54
		],
		[
			9.57468,
			69.8303,
			4.54
		],
		[
			14.85649,
			19.1005,
			4.54
		],
		[
			15.20369,
			-19.7917,
			4.54
		],
		[
			15.38593,
			-36.8585,
			4.54
		],
		[
			19.94912,
			-27.1699,
			4.54
		],
		[
			23.11674,
			9.4095,
			4.54
		],
		[
			23.48591,
			12.7606,
			4.54
		],
		[
			.06233,
			-17.336,
			4.55
		],
		[
			3.49854,
			58.8787,
			4.55
		],
		[
			5.07345,
			-35.483,
			4.55
		],
		[
			7.00112,
			76.9774,
			4.55
		],
		[
			7.49661,
			12.0066,
			4.55
		],
		[
			9.86843,
			54.0643,
			4.55
		],
		[
			15.59813,
			-44.9584,
			4.55
		],
		[
			16.34394,
			-24.1693,
			4.55
		],
		[
			18.13471,
			-28.4571,
			4.55
		],
		[
			21.69869,
			71.3114,
			4.55
		],
		[
			22.35043,
			46.5366,
			4.55
		],
		[
			22.40861,
			49.4764,
			4.55
		],
		[
			2.85857,
			35.0597,
			4.56
		],
		[
			3.9791,
			-61.4002,
			4.56
		],
		[
			5.88879,
			27.6123,
			4.56
		],
		[
			9.10883,
			38.4522,
			4.56
		],
		[
			11.2534,
			23.0955,
			4.56
		],
		[
			14.43562,
			-45.2214,
			4.56
		],
		[
			17.59433,
			-46.5057,
			4.56
		],
		[
			20.8688,
			27.097,
			4.56
		],
		[
			21.11003,
			47.6484,
			4.56
		],
		[
			3.61825,
			-40.2745,
			4.57
		],
		[
			16.4236,
			14.0333,
			4.57
		],
		[
			16.42642,
			-23.4472,
			4.57
		],
		[
			17.69899,
			72.1488,
			4.57
		],
		[
			18.91247,
			22.6451,
			4.57
		],
		[
			19.13916,
			-40.4967,
			4.57
		],
		[
			19.89103,
			24.0796,
			4.57
		],
		[
			5.58977,
			-4.8384,
			4.58
		],
		[
			9.86129,
			-46.5476,
			4.58
		],
		[
			10.72563,
			-60.5666,
			4.58
		],
		[
			13.20489,
			-59.9206,
			4.58
		],
		[
			13.85721,
			64.7233,
			4.58
		],
		[
			16.20506,
			-27.9264,
			4.58
		],
		[
			17.63075,
			-8.1188,
			4.58
		],
		[
			23.34395,
			23.7403,
			4.58
		],
		[
			.68877,
			-46.085,
			4.59
		],
		[
			3.71391,
			-37.3135,
			4.59
		],
		[
			3.83931,
			71.3323,
			4.59
		],
		[
			5.44729,
			3.0957,
			4.59
		],
		[
			8.67023,
			64.3279,
			4.59
		],
		[
			9.48581,
			-2.769,
			4.59
		],
		[
			10.32687,
			-55.0293,
			4.59
		],
		[
			11.21001,
			-60.3176,
			4.59
		],
		[
			15.82657,
			26.0684,
			4.59
		],
		[
			15.89353,
			-25.3271,
			4.59
		],
		[
			18.73966,
			39.6127,
			4.59
		],
		[
			19.61179,
			-24.8836,
			4.59
		],
		[
			23.81543,
			-28.1303,
			4.59
		],
		[
			4.30406,
			50.2955,
			4.6
		],
		[
			10.08541,
			-13.0646,
			4.6
		],
		[
			10.94529,
			-37.1378,
			4.6
		],
		[
			14.75402,
			16.9643,
			4.6
		],
		[
			15.42228,
			-38.7336,
			4.6
		],
		[
			15.87793,
			42.4515,
			4.6
		],
		[
			19.34447,
			65.7145,
			4.6
		],
		[
			.08893,
			-5.7076,
			4.61
		],
		[
			.28486,
			38.6816,
			4.61
		],
		[
			1.8926,
			3.1875,
			4.61
		],
		[
			3.18816,
			39.6116,
			4.61
		],
		[
			7.44523,
			49.2115,
			4.61
		],
		[
			7.99779,
			-18.3992,
			4.61
		],
		[
			15.56964,
			-10.0645,
			4.61
		],
		[
			20.56505,
			35.2509,
			4.61
		],
		[
			.94442,
			59.1811,
			4.62
		],
		[
			3.99875,
			-24.0162,
			4.62
		],
		[
			5.05159,
			21.59,
			4.62
		],
		[
			5.53218,
			-7.3015,
			4.62
		],
		[
			9.13413,
			-25.8585,
			4.62
		],
		[
			11.08362,
			7.336,
			4.62
		],
		[
			11.10901,
			-62.4241,
			4.62
		],
		[
			11.57935,
			-54.2641,
			4.62
		],
		[
			12.77297,
			-56.4888,
			4.62
		],
		[
			12.91089,
			-59.1467,
			4.62
		],
		[
			16.46339,
			-8.3717,
			4.62
		],
		[
			18.00806,
			-3.6903,
			4.62
		],
		[
			18.55839,
			-42.3125,
			4.62
		],
		[
			18.93699,
			4.2036,
			4.62
		],
		[
			2.98687,
			21.3404,
			4.63
		],
		[
			7.72566,
			-28.4109,
			4.63
		],
		[
			7.88434,
			-49.613,
			4.63
		],
		[
			8.72788,
			-7.2337,
			4.63
		],
		[
			9.26252,
			-37.4131,
			4.63
		],
		[
			12.66459,
			-39.9873,
			4.63
		],
		[
			13.67897,
			54.6816,
			4.63
		],
		[
			14.95973,
			65.9325,
			4.63
		],
		[
			15.84965,
			-25.7513,
			4.63
		],
		[
			16.05891,
			-57.7751,
			4.63
		],
		[
			18.52289,
			-62.2783,
			4.63
		],
		[
			18.85336,
			59.3884,
			4.63
		],
		[
			23.96265,
			25.1414,
			4.63
		],
		[
			3.89519,
			-24.6122,
			4.64
		],
		[
			4.91493,
			10.1508,
			4.64
		],
		[
			6.06533,
			20.1385,
			4.64
		],
		[
			13.77761,
			-51.4328,
			4.64
		],
		[
			15.6563,
			36.6358,
			4.64
		],
		[
			15.68649,
			-44.6612,
			4.64
		],
		[
			16.83057,
			-10.783,
			4.64
		],
		[
			17.29451,
			37.2915,
			4.64
		],
		[
			18.12177,
			8.7339,
			4.64
		],
		[
			19.44197,
			.3386,
			4.64
		],
		[
			20.58848,
			14.6742,
			4.64
		],
		[
			22.62289,
			51.5451,
			4.64
		],
		[
			23.06972,
			50.0521,
			4.64
		],
		[
			2.7242,
			27.7071,
			4.65
		],
		[
			4.56415,
			14.8444,
			4.65
		],
		[
			5.07615,
			15.4041,
			4.65
		],
		[
			5.90168,
			-63.0896,
			4.65
		],
		[
			7.30511,
			-36.734,
			4.65
		],
		[
			7.51183,
			-30.9623,
			4.65
		],
		[
			7.58969,
			-28.3693,
			4.65
		],
		[
			10.4568,
			-57.6388,
			4.65
		],
		[
			12.01455,
			6.6143,
			4.65
		],
		[
			16.05358,
			-49.2297,
			4.65
		],
		[
			1.19089,
			21.0347,
			4.66
		],
		[
			1.82642,
			-10.6864,
			4.66
		],
		[
			6.68296,
			9.8958,
			4.66
		],
		[
			6.92707,
			-20.1365,
			4.66
		],
		[
			7.27639,
			-27.8812,
			4.66
		],
		[
			8.72143,
			21.4685,
			4.66
		],
		[
			9.09399,
			-70.5385,
			4.66
		],
		[
			10.89965,
			43.19,
			4.66
		],
		[
			12.6541,
			-7.9956,
			4.66
		],
		[
			12.70985,
			-48.8131,
			4.66
		],
		[
			15.66277,
			-34.4119,
			4.66
		],
		[
			18.08367,
			-29.5801,
			4.66
		],
		[
			18.30089,
			-27.0426,
			4.66
		],
		[
			18.39433,
			-8.9344,
			4.66
		],
		[
			20.01835,
			27.7536,
			4.66
		],
		[
			1.22915,
			24.5837,
			4.67
		],
		[
			3.48946,
			49.5089,
			4.67
		],
		[
			4.24815,
			40.4837,
			4.67
		],
		[
			4.65459,
			15.918,
			4.67
		],
		[
			6.10259,
			-14.9353,
			4.67
		],
		[
			8.20353,
			17.6478,
			4.67
		],
		[
			9.18196,
			63.5136,
			4.67
		],
		[
			18.00095,
			16.7509,
			4.67
		],
		[
			18.48663,
			-14.5658,
			4.67
		],
		[
			18.73899,
			39.6701,
			4.67
		],
		[
			19.53933,
			69.6612,
			4.67
		],
		[
			21.02152,
			-32.2578,
			4.67
		],
		[
			1.56552,
			59.232,
			4.68
		],
		[
			1.91559,
			-67.6473,
			4.68
		],
		[
			2.07485,
			-29.2968,
			4.68
		],
		[
			2.97935,
			39.6627,
			4.68
		],
		[
			8.93869,
			-52.7235,
			4.68
		],
		[
			9.64091,
			4.6493,
			4.68
		],
		[
			10.00356,
			8.0442,
			4.68
		],
		[
			10.64534,
			31.9762,
			4.68
		],
		[
			13.53275,
			-6.2558,
			4.68
		],
		[
			13.57424,
			49.016,
			4.68
		],
		[
			16.33911,
			-78.6957,
			4.68
		],
		[
			19.65628,
			30.1533,
			4.68
		],
		[
			21.6292,
			-7.8542,
			4.68
		],
		[
			22.72645,
			-18.8304,
			4.68
		],
		[
			4.44344,
			14.7138,
			4.69
		],
		[
			5.31902,
			40.0991,
			4.69
		],
		[
			7.63835,
			-25.3648,
			4.69
		],
		[
			7.8056,
			-47.0777,
			4.69
		],
		[
			8.02037,
			-1.3926,
			4.69
		],
		[
			10.64583,
			-59.183,
			4.69
		],
		[
			12.76057,
			-60.9813,
			4.69
		],
		[
			21.70157,
			51.1896,
			4.69
		],
		[
			22.05601,
			-56.786,
			4.69
		],
		[
			23.5846,
			-42.6151,
			4.69
		],
		[
			5.34081,
			-21.2398,
			4.7
		],
		[
			11.61137,
			-9.8022,
			4.7
		],
		[
			11.67022,
			-34.7447,
			4.7
		],
		[
			16.89993,
			-42.362,
			4.7
		],
		[
			18.70456,
			-9.0525,
			4.7
		],
		[
			19.93065,
			-26.2995,
			4.7
		],
		[
			21.17236,
			10.1316,
			4.7
		],
		[
			22.90693,
			84.3462,
			4.7
		],
		[
			23.55462,
			-20.9145,
			4.7
		],
		[
			2.99525,
			8.9074,
			4.71
		],
		[
			3.48963,
			-62.9375,
			4.71
		],
		[
			4.87555,
			14.2506,
			4.71
		],
		[
			5.09185,
			-57.4727,
			4.71
		],
		[
			5.49555,
			-1.0922,
			4.71
		],
		[
			5.54547,
			32.192,
			4.71
		],
		[
			9.35822,
			-25.9654,
			4.71
		],
		[
			9.38673,
			-28.8339,
			4.71
		],
		[
			11.74605,
			-18.3507,
			4.71
		],
		[
			13.10464,
			-48.4633,
			4.71
		],
		[
			13.9608,
			-63.6867,
			4.71
		],
		[
			19.90413,
			8.4615,
			4.71
		],
		[
			21.29897,
			-32.1725,
			4.71
		],
		[
			23.16525,
			-22.4576,
			4.71
		],
		[
			1.43223,
			68.13,
			4.72
		],
		[
			5.36271,
			-.3825,
			4.72
		],
		[
			5.85068,
			37.3056,
			4.72
		],
		[
			6.17164,
			-54.9686,
			4.72
		],
		[
			8.18786,
			-12.927,
			4.72
		],
		[
			9.45511,
			-22.3438,
			4.72
		],
		[
			10.43189,
			33.7961,
			4.72
		],
		[
			10.50559,
			-71.9928,
			4.72
		],
		[
			10.55386,
			40.4256,
			4.72
		],
		[
			12.07201,
			-63.1657,
			4.72
		],
		[
			12.34529,
			17.7929,
			4.72
		],
		[
			13.29237,
			40.5726,
			4.72
		],
		[
			16.04664,
			46.0367,
			4.72
		],
		[
			17.27686,
			-.4453,
			4.72
		],
		[
			21.71097,
			-18.8663,
			4.72
		],
		[
			2.42706,
			50.2786,
			4.73
		],
		[
			6.91073,
			13.1778,
			4.73
		],
		[
			8.19053,
			-42.9873,
			4.73
		],
		[
			11.03047,
			-2.4846,
			4.73
		],
		[
			16.10818,
			-45.1732,
			4.73
		],
		[
			16.14953,
			36.4909,
			4.73
		],
		[
			20.87757,
			-8.9833,
			4.73
		],
		[
			.52955,
			54.5223,
			4.74
		],
		[
			1.32444,
			27.2641,
			4.74
		],
		[
			2.53479,
			-15.2447,
			4.74
		],
		[
			2.66333,
			-42.8917,
			4.74
		],
		[
			3.33313,
			65.6523,
			4.74
		],
		[
			3.51029,
			-5.0751,
			4.74
		],
		[
			8.15019,
			-61.3024,
			4.74
		],
		[
			8.68698,
			-47.3171,
			4.74
		],
		[
			9.04241,
			67.6296,
			4.74
		],
		[
			13.30675,
			-18.3112,
			4.74
		],
		[
			14.16523,
			-53.4389,
			4.74
		],
		[
			15.85442,
			20.9779,
			4.74
		],
		[
			17.99654,
			-23.8161,
			4.74
		],
		[
			19.05191,
			-42.0951,
			4.74
		],
		[
			19.52953,
			34.453,
			4.74
		],
		[
			20.9971,
			47.521,
			4.74
		],
		[
			22.05523,
			-2.1554,
			4.74
		],
		[
			23.63083,
			-45.4924,
			4.74
		],
		[
			7.24393,
			-48.2719,
			4.75
		],
		[
			11.80404,
			-66.8149,
			4.75
		],
		[
			13.88681,
			-31.9276,
			4.75
		],
		[
			14.26943,
			51.3672,
			4.75
		],
		[
			15.69911,
			-19.6788,
			4.75
		],
		[
			15.71139,
			-34.7104,
			4.75
		],
		[
			20.59301,
			-60.5817,
			4.75
		],
		[
			23.31041,
			68.1114,
			4.75
		],
		[
			.52361,
			-48.8035,
			4.76
		],
		[
			2.84124,
			-75.0669,
			4.76
		],
		[
			2.85065,
			-21.004,
			4.76
		],
		[
			5.87401,
			1.8551,
			4.76
		],
		[
			6.31411,
			69.3198,
			4.76
		],
		[
			7.96114,
			-30.3346,
			4.76
		],
		[
			9.68806,
			-23.5915,
			4.76
		],
		[
			10.70392,
			-64.4664,
			4.76
		],
		[
			11.31886,
			38.1856,
			4.76
		],
		[
			12.40041,
			51.5623,
			4.76
		],
		[
			12.98207,
			17.4094,
			4.76
		],
		[
			13.45755,
			-15.9736,
			4.76
		],
		[
			13.86319,
			34.4442,
			4.76
		],
		[
			14.37697,
			-58.4591,
			4.76
		],
		[
			17.36652,
			-67.7707,
			4.76
		],
		[
			17.67329,
			-49.4156,
			4.76
		],
		[
			19.27029,
			21.3904,
			4.76
		],
		[
			21.63201,
			62.0819,
			4.76
		],
		[
			23.11854,
			25.4683,
			4.76
		],
		[
			.7365,
			-10.6096,
			4.77
		],
		[
			3.09233,
			56.7057,
			4.77
		],
		[
			5.64808,
			-7.2128,
			4.77
		],
		[
			6.78884,
			8.0373,
			4.77
		],
		[
			9.32955,
			-11.9749,
			4.77
		],
		[
			11.50525,
			-3.0035,
			4.77
		],
		[
			12.90588,
			-9.539,
			4.77
		],
		[
			17.61586,
			68.758,
			4.77
		],
		[
			18.05137,
			-8.1803,
			4.77
		],
		[
			18.54292,
			57.0456,
			4.77
		],
		[
			20.05929,
			-37.9407,
			4.77
		],
		[
			20.29645,
			38.0329,
			4.77
		],
		[
			20.34439,
			-12.7591,
			4.77
		],
		[
			20.48101,
			-17.8137,
			4.77
		],
		[
			22.79141,
			83.1538,
			4.77
		],
		[
			.02659,
			-77.0657,
			4.78
		],
		[
			.88347,
			-1.1443,
			4.78
		],
		[
			2.14146,
			37.8591,
			4.78
		],
		[
			3.76731,
			63.345,
			4.78
		],
		[
			4.50934,
			16.194,
			4.78
		],
		[
			4.99881,
			-12.5374,
			4.78
		],
		[
			5.58408,
			-6.002,
			4.78
		],
		[
			8.14096,
			51.5067,
			4.78
		],
		[
			8.22487,
			-35.8995,
			4.78
		],
		[
			9.73669,
			-27.7695,
			4.78
		],
		[
			10.32893,
			19.4709,
			4.78
		],
		[
			12.37509,
			25.8462,
			4.78
		],
		[
			13.29341,
			5.4699,
			4.78
		],
		[
			14.34516,
			-45.1871,
			4.78
		],
		[
			14.38494,
			-27.754,
			4.78
		],
		[
			17.5236,
			-23.9626,
			4.78
		],
		[
			17.83642,
			-40.0904,
			4.78
		],
		[
			18.75747,
			-64.8713,
			4.78
		],
		[
			22.35537,
			28.3305,
			4.78
		],
		[
			22.46431,
			4.6957,
			4.78
		],
		[
			.24338,
			20.2067,
			4.79
		],
		[
			1.96548,
			23.5961,
			4.79
		],
		[
			4.87722,
			36.7032,
			4.79
		],
		[
			8.37547,
			-48.4904,
			4.79
		],
		[
			9.34911,
			-62.4046,
			4.79
		],
		[
			13.25415,
			-67.8946,
			4.79
		],
		[
			15.85387,
			35.6574,
			4.79
		],
		[
			16.50347,
			-25.1152,
			4.79
		],
		[
			17.81958,
			-31.7032,
			4.79
		],
		[
			18.00439,
			4.3686,
			4.79
		],
		[
			20.25441,
			25.592,
			4.79
		],
		[
			22.16345,
			72.3412,
			4.79
		],
		[
			22.26025,
			-41.3467,
			4.79
		],
		[
			.70108,
			50.5125,
			4.8
		],
		[
			.8845,
			61.124,
			4.8
		],
		[
			3.26389,
			-8.8197,
			4.8
		],
		[
			4.35921,
			46.4989,
			4.8
		],
		[
			4.4016,
			17.4441,
			4.8
		],
		[
			5.02399,
			-7.174,
			4.8
		],
		[
			6.65551,
			42.4889,
			4.8
		],
		[
			9.17321,
			67.134,
			4.8
		],
		[
			9.26981,
			54.0219,
			4.8
		],
		[
			9.34139,
			-9.5557,
			4.8
		],
		[
			10.73525,
			-63.9611,
			4.8
		],
		[
			12.58085,
			22.6293,
			4.8
		],
		[
			13.11965,
			27.6247,
			4.8
		],
		[
			14.14748,
			77.5475,
			4.8
		],
		[
			14.29995,
			35.5095,
			4.8
		],
		[
			14.72371,
			26.5279,
			4.8
		],
		[
			15.03514,
			25.0081,
			4.8
		],
		[
			16.30497,
			-28.614,
			4.8
		],
		[
			17.28877,
			33.1001,
			4.8
		],
		[
			20.22168,
			46.8157,
			4.8
		],
		[
			20.88743,
			44.3873,
			4.8
		],
		[
			21.34601,
			-40.8095,
			4.8
		],
		[
			22.42129,
			1.3774,
			4.8
		],
		[
			22.69595,
			29.3076,
			4.8
		],
		[
			5.16165,
			15.5972,
			4.81
		],
		[
			5.22929,
			-67.1853,
			4.81
		],
		[
			5.29141,
			-34.8952,
			4.81
		],
		[
			5.96657,
			25.9539,
			4.81
		],
		[
			8.00555,
			-63.5675,
			4.81
		],
		[
			9.5844,
			39.6215,
			4.81
		],
		[
			11.41017,
			-10.8593,
			4.81
		],
		[
			14.47004,
			-2.228,
			4.81
		],
		[
			18.42251,
			-20.5417,
			4.81
		],
		[
			20.64204,
			21.2012,
			4.81
		],
		[
			20.81563,
			46.1141,
			4.81
		],
		[
			1.9528,
			-47.3853,
			4.82
		],
		[
			5.22381,
			38.4845,
			4.82
		],
		[
			6.65465,
			-14.1458,
			4.82
		],
		[
			6.89247,
			-20.2243,
			4.82
		],
		[
			7.56332,
			-14.5239,
			4.82
		],
		[
			10.37211,
			-41.65,
			4.82
		],
		[
			10.51044,
			55.9805,
			4.82
		],
		[
			12.44215,
			-51.4506,
			4.82
		],
		[
			13.62434,
			36.2949,
			4.82
		],
		[
			14.17331,
			25.0917,
			4.82
		],
		[
			16.03825,
			22.8045,
			4.82
		],
		[
			16.36787,
			1.029,
			4.82
		],
		[
			16.82061,
			45.9833,
			4.82
		],
		[
			17.01767,
			-4.2226,
			4.82
		],
		[
			18.43309,
			65.5635,
			4.82
		],
		[
			18.90663,
			71.2972,
			4.82
		],
		[
			21.07342,
			-19.855,
			4.82
		],
		[
			22.35863,
			12.2052,
			4.82
		],
		[
			22.51078,
			-10.678,
			4.82
		],
		[
			23.29573,
			49.0153,
			4.82
		],
		[
			23.69606,
			-17.8165,
			4.82
		],
		[
			.91671,
			58.9727,
			4.83
		],
		[
			1.46094,
			45.4067,
			4.83
		],
		[
			2.6594,
			-11.8722,
			4.83
		],
		[
			2.75907,
			-67.6166,
			4.83
		],
		[
			7.14752,
			-39.6557,
			4.83
		],
		[
			7.2769,
			-23.3156,
			4.83
		],
		[
			8.35639,
			-33.0544,
			4.83
		],
		[
			8.70705,
			-53.114,
			4.83
		],
		[
			13.05925,
			-49.5273,
			4.83
		],
		[
			15.06314,
			47.6541,
			4.83
		],
		[
			15.21377,
			-44.5004,
			4.83
		],
		[
			16.47737,
			41.8817,
			4.83
		],
		[
			17.08037,
			-34.1229,
			4.83
		],
		[
			18.76791,
			26.6621,
			4.83
		],
		[
			18.95102,
			-5.8463,
			4.83
		],
		[
			18.97871,
			-37.1074,
			4.83
		],
		[
			1.50309,
			6.1438,
			4.84
		],
		[
			2.22037,
			44.2317,
			4.84
		],
		[
			2.28423,
			34.2242,
			4.84
		],
		[
			3.32269,
			3.3702,
			4.84
		],
		[
			4.23233,
			9.2638,
			4.84
		],
		[
			5.68825,
			16.5341,
			4.84
		],
		[
			7.65759,
			-38.308,
			4.84
		],
		[
			8.58881,
			-58.0092,
			4.84
		],
		[
			11.00935,
			3.6175,
			4.84
		],
		[
			11.75473,
			8.2581,
			4.84
		],
		[
			14.32923,
			16.3069,
			4.84
		],
		[
			16.54341,
			11.488,
			4.84
		],
		[
			16.68198,
			64.589,
			4.84
		],
		[
			16.75495,
			56.7819,
			4.84
		],
		[
			19.98255,
			-26.1958,
			4.84
		],
		[
			22.72499,
			-41.4143,
			4.84
		],
		[
			22.76052,
			-53.5001,
			4.84
		],
		[
			23.11023,
			59.4198,
			4.84
		],
		[
			3.19897,
			74.3937,
			4.85
		],
		[
			3.31217,
			34.2227,
			4.85
		],
		[
			7.49761,
			-23.0243,
			4.85
		],
		[
			10.14895,
			-51.8113,
			4.85
		],
		[
			13.20089,
			-37.803,
			4.85
		],
		[
			15.29413,
			-63.6105,
			4.85
		],
		[
			17.94651,
			-44.3422,
			4.85
		],
		[
			18.34779,
			3.3772,
			4.85
		],
		[
			18.97438,
			-52.9386,
			4.85
		],
		[
			.46547,
			-33.0072,
			4.86
		],
		[
			3.30614,
			-22.5111,
			4.86
		],
		[
			6.77059,
			59.4417,
			4.86
		],
		[
			8.6618,
			-29.5611,
			4.86
		],
		[
			10.58485,
			75.7129,
			4.86
		],
		[
			13.28695,
			-66.7834,
			4.86
		],
		[
			14.38964,
			8.4466,
			4.86
		],
		[
			14.6941,
			8.1618,
			4.86
		],
		[
			16.36829,
			30.892,
			4.86
		],
		[
			16.56806,
			-44.0453,
			4.86
		],
		[
			16.64579,
			48.9283,
			4.86
		],
		[
			17.53779,
			55.173,
			4.86
		],
		[
			17.72383,
			-21.6832,
			4.86
		],
		[
			18.73871,
			-35.642,
			4.86
		],
		[
			18.90283,
			-22.7448,
			4.86
		],
		[
			19.25901,
			-25.2567,
			4.86
		],
		[
			20.62647,
			-61.5299,
			4.86
		],
		[
			22.09465,
			5.0585,
			4.86
		],
		[
			1.37234,
			45.5288,
			4.87
		],
		[
			2.59791,
			5.5932,
			4.87
		],
		[
			3.24836,
			21.0444,
			4.87
		],
		[
			4.23991,
			-10.2563,
			4.87
		],
		[
			7.22037,
			-45.1827,
			4.87
		],
		[
			8.69537,
			-15.9434,
			4.87
		],
		[
			8.92543,
			-27.6819,
			4.87
		],
		[
			9.90342,
			-25.9323,
			4.87
		],
		[
			10.62048,
			-27.4126,
			4.87
		],
		[
			10.78089,
			-64.3835,
			4.87
		],
		[
			19.77271,
			-19.7611,
			4.87
		],
		[
			21.5796,
			38.5341,
			4.87
		],
		[
			2.4325,
			-12.2905,
			4.88
		],
		[
			5.46058,
			21.937,
			4.88
		],
		[
			5.81693,
			24.5675,
			4.88
		],
		[
			5.88525,
			-33.8014,
			4.88
		],
		[
			7.31121,
			-24.5587,
			4.88
		],
		[
			11.99377,
			-78.2218,
			4.88
		],
		[
			12.69807,
			10.2356,
			4.88
		],
		[
			13.00457,
			30.785,
			4.88
		],
		[
			16.9338,
			65.1348,
			4.88
		],
		[
			17.96328,
			-41.7163,
			4.88
		],
		[
			18.72535,
			-8.2752,
			4.88
		],
		[
			19.29391,
			-18.9529,
			4.88
		],
		[
			19.58694,
			-48.0992,
			4.88
		],
		[
			23.78429,
			58.652,
			4.88
		],
		[
			23.97788,
			-3.556,
			4.88
		],
		[
			23.98348,
			55.7549,
			4.88
		],
		[
			.18774,
			-15.468,
			4.89
		],
		[
			4.83185,
			37.4883,
			4.89
		],
		[
			5.41245,
			1.8464,
			4.89
		],
		[
			5.82581,
			12.6513,
			4.89
		],
		[
			7.65276,
			34.5843,
			4.89
		],
		[
			7.76873,
			18.51,
			4.89
		],
		[
			10.52273,
			-53.7155,
			4.89
		],
		[
			10.62591,
			-13.3845,
			4.89
		],
		[
			11.7753,
			-40.5004,
			4.89
		],
		[
			11.86423,
			-65.2059,
			4.89
		],
		[
			12.88826,
			21.2449,
			4.89
		],
		[
			14.30386,
			-81.0078,
			4.89
		],
		[
			17.08963,
			12.7408,
			4.89
		],
		[
			17.53627,
			55.1842,
			4.89
		],
		[
			19.73795,
			37.3544,
			4.89
		],
		[
			20.8328,
			-33.7797,
			4.89
		],
		[
			22.65435,
			39.0503,
			4.89
		],
		[
			23.50054,
			58.5489,
			4.89
		],
		[
			.81389,
			50.9682,
			4.9
		],
		[
			1.42701,
			-14.5988,
			4.9
		],
		[
			5.70795,
			1.4746,
			4.9
		],
		[
			6.96031,
			45.0941,
			4.9
		],
		[
			12.84477,
			-33.9993,
			4.9
		],
		[
			13.23754,
			-59.1032,
			4.9
		],
		[
			16.05672,
			-38.6025,
			4.9
		],
		[
			16.09071,
			-19.8019,
			4.9
		],
		[
			16.47449,
			-70.0844,
			4.9
		],
		[
			19.85114,
			22.61,
			4.9
		],
		[
			20.82471,
			-46.2268,
			4.9
		],
		[
			2.70414,
			40.1939,
			4.91
		],
		[
			4.53129,
			-.044,
			4.91
		],
		[
			5.02377,
			-20.0519,
			4.91
		],
		[
			5.12417,
			18.6451,
			4.91
		],
		[
			6.33322,
			-2.9445,
			4.91
		],
		[
			7.17047,
			-4.2371,
			4.91
		],
		[
			7.19426,
			39.3205,
			4.91
		],
		[
			10.64304,
			-16.8766,
			4.91
		],
		[
			12.69905,
			-59.6858,
			4.91
		],
		[
			13.57995,
			37.1824,
			4.91
		],
		[
			15.01621,
			-8.5189,
			4.91
		],
		[
			15.2437,
			-31.5191,
			4.91
		],
		[
			16.69289,
			-17.7422,
			4.91
		],
		[
			17.08892,
			54.47,
			4.91
		],
		[
			19.92716,
			52.4389,
			4.91
		],
		[
			20.49417,
			-2.8855,
			4.91
		],
		[
			20.61212,
			-2.55,
			4.91
		],
		[
			22.55002,
			-61.9821,
			4.91
		],
		[
			22.92047,
			8.8162,
			4.91
		],
		[
			1.9445,
			-22.5268,
			4.92
		],
		[
			6.03067,
			-10.5979,
			4.92
		],
		[
			6.08309,
			-16.4844,
			4.92
		],
		[
			6.41497,
			49.2879,
			4.92
		],
		[
			7.06489,
			-49.5839,
			4.92
		],
		[
			7.51791,
			82.4115,
			4.92
		],
		[
			9.2602,
			-38.5699,
			4.92
		],
		[
			11.08886,
			-27.2936,
			4.92
		],
		[
			12.44002,
			27.2682,
			4.92
		],
		[
			13.56887,
			3.659,
			4.92
		],
		[
			13.82857,
			21.2641,
			4.92
		],
		[
			14.74978,
			-35.1918,
			4.92
		],
		[
			15.4033,
			-10.3223,
			4.92
		],
		[
			18.11386,
			-43.4252,
			4.92
		],
		[
			18.33831,
			21.9613,
			4.92
		],
		[
			18.52929,
			-45.9148,
			4.92
		],
		[
			18.88709,
			50.7082,
			4.92
		],
		[
			20.74792,
			25.2706,
			4.92
		],
		[
			4.18072,
			-41.9936,
			4.93
		],
		[
			4.28769,
			20.5786,
			4.93
		],
		[
			4.34018,
			34.5667,
			4.93
		],
		[
			4.98761,
			37.8902,
			4.93
		],
		[
			7.59437,
			-52.5338,
			4.93
		],
		[
			7.71678,
			58.7104,
			4.93
		],
		[
			7.9956,
			-3.6796,
			4.93
		],
		[
			8.94956,
			-59.2293,
			4.93
		],
		[
			9.70401,
			-23.9156,
			4.93
		],
		[
			11.53789,
			-29.261,
			4.93
		],
		[
			11.68157,
			-62.0901,
			4.93
		],
		[
			12.27237,
			23.9454,
			4.93
		],
		[
			12.86165,
			27.5407,
			4.93
		],
		[
			13.01214,
			56.3663,
			4.93
		],
		[
			14.18069,
			-16.302,
			4.93
		],
		[
			14.8503,
			-2.2992,
			4.93
		],
		[
			15.12169,
			24.8692,
			4.93
		],
		[
			16.2,
			-10.0643,
			4.93
		],
		[
			19.61485,
			-7.0275,
			4.93
		],
		[
			20.1231,
			-52.8808,
			4.93
		],
		[
			20.15711,
			36.8396,
			4.93
		],
		[
			20.24223,
			36.8063,
			4.93
		],
		[
			20.78632,
			34.3741,
			4.93
		],
		[
			23.28081,
			-7.7265,
			4.93
		],
		[
			23.73319,
			29.3615,
			4.93
		],
		[
			2.20619,
			30.3031,
			4.94
		],
		[
			2.98435,
			35.1831,
			4.94
		],
		[
			6.93777,
			-48.7211,
			4.94
		],
		[
			7.37043,
			-19.0166,
			4.94
		],
		[
			8.05863,
			27.7943,
			4.94
		],
		[
			8.8299,
			-45.3079,
			4.94
		],
		[
			9.9145,
			-19.0094,
			4.94
		],
		[
			10.40218,
			65.5664,
			4.94
		],
		[
			10.51724,
			-73.2215,
			4.94
		],
		[
			13.15091,
			-23.1181,
			4.94
		],
		[
			13.22859,
			40.1529,
			4.94
		],
		[
			16.46639,
			68.7681,
			4.94
		],
		[
			19.00023,
			32.1455,
			4.94
		],
		[
			20.23795,
			15.1976,
			4.94
		],
		[
			20.50099,
			48.9516,
			4.94
		],
		[
			22.16911,
			-32.5484,
			4.94
		],
		[
			.72447,
			47.0245,
			4.95
		],
		[
			1.3347,
			58.2316,
			4.95
		],
		[
			3.95707,
			63.0723,
			4.95
		],
		[
			5.68075,
			-1.1288,
			4.95
		],
		[
			6.20091,
			16.1304,
			4.95
		],
		[
			11.46562,
			2.8563,
			4.95
		],
		[
			12.57889,
			70.0218,
			4.95
		],
		[
			15.96983,
			-14.2794,
			4.95
		],
		[
			16.22465,
			-54.6305,
			4.95
		],
		[
			16.29175,
			75.7553,
			4.95
		],
		[
			19.93105,
			38.4867,
			4.95
		],
		[
			20.02909,
			-59.3759,
			4.95
		],
		[
			22.86723,
			43.3124,
			4.95
		],
		[
			23.44887,
			1.2556,
			4.95
		],
		[
			23.7732,
			3.4868,
			4.95
		],
		[
			1.67634,
			40.577,
			4.96
		],
		[
			1.69643,
			42.6134,
			4.96
		],
		[
			2.56409,
			-28.2323,
			4.96
		],
		[
			3.35738,
			43.3297,
			4.96
		],
		[
			4.47399,
			16.3597,
			4.96
		],
		[
			5.32128,
			22.0965,
			4.96
		],
		[
			5.91411,
			55.7069,
			4.96
		],
		[
			13.83119,
			-18.1342,
			4.96
		],
		[
			15.96318,
			54.7498,
			4.96
		],
		[
			16.05573,
			-25.8652,
			4.96
		],
		[
			18.10053,
			22.2189,
			4.96
		],
		[
			18.19537,
			-23.7012,
			4.96
		],
		[
			18.19838,
			31.4053,
			4.96
		],
		[
			23.41396,
			62.2828,
			4.96
		],
		[
			1.25309,
			-45.5317,
			4.97
		],
		[
			1.93334,
			68.6852,
			4.97
		],
		[
			3.70629,
			33.965,
			4.97
		],
		[
			4.02171,
			-61.0788,
			4.97
		],
		[
			4.33923,
			27.3508,
			4.97
		],
		[
			5.92498,
			-37.1207,
			4.97
		],
		[
			7.89161,
			26.7658,
			4.97
		],
		[
			10.38282,
			-66.9015,
			4.97
		],
		[
			12.33916,
			3.3126,
			4.97
		],
		[
			13.47383,
			13.7788,
			4.97
		],
		[
			14.46956,
			-29.4916,
			4.97
		],
		[
			15.67136,
			-23.8181,
			4.97
		],
		[
			16.28359,
			-50.0681,
			4.97
		],
		[
			17.05219,
			14.0919,
			4.97
		],
		[
			23.56589,
			31.3253,
			4.97
		],
		[
			23.66307,
			-14.2222,
			4.97
		],
		[
			23.76723,
			46.4203,
			4.97
		],
		[
			1.71209,
			-3.6902,
			4.98
		],
		[
			2.15704,
			25.9399,
			4.98
		],
		[
			2.97995,
			-64.0713,
			4.98
		],
		[
			5.11129,
			51.5977,
			4.98
		],
		[
			5.58773,
			-5.3873,
			4.98
		],
		[
			5.58969,
			-5.4161,
			4.98
		],
		[
			7.67311,
			-15.2639,
			4.98
		],
		[
			8.66707,
			-12.4754,
			4.98
		],
		[
			11.01245,
			6.1014,
			4.98
		],
		[
			11.83239,
			-70.2258,
			4.98
		],
		[
			12.44981,
			26.8257,
			4.98
		],
		[
			15.52972,
			40.8993,
			4.98
		],
		[
			16.02405,
			29.8511,
			4.98
		],
		[
			18.3985,
			58.8007,
			4.98
		],
		[
			18.9374,
			4.2021,
			4.98
		],
		[
			19.34247,
			-5.4158,
			4.98
		],
		[
			19.93205,
			58.846,
			4.98
		],
		[
			.07503,
			-10.5095,
			4.99
		],
		[
			2.03837,
			54.4875,
			4.99
		],
		[
			3.46752,
			49.0629,
			4.99
		],
		[
			3.70414,
			-31.9384,
			4.99
		],
		[
			3.9523,
			61.1089,
			4.99
		],
		[
			4.64821,
			-12.1231,
			4.99
		],
		[
			5.38055,
			3.5445,
			4.99
		],
		[
			6.84609,
			41.7812,
			4.99
		],
		[
			6.84787,
			-34.3673,
			4.99
		],
		[
			7.04855,
			-4.2392,
			4.99
		],
		[
			7.42747,
			9.2761,
			4.99
		],
		[
			8.22221,
			-15.7882,
			4.99
		],
		[
			9.09955,
			5.0923,
			4.99
		],
		[
			9.18455,
			-44.8679,
			4.99
		],
		[
			9.53243,
			11.2998,
			4.99
		],
		[
			11.38044,
			43.4827,
			4.99
		],
		[
			12.27504,
			33.0615,
			4.99
		],
		[
			13.69577,
			-54.5594,
			4.99
		],
		[
			14.20439,
			2.4094,
			4.99
		],
		[
			15.36897,
			-47.9278,
			4.99
		],
		[
			15.38675,
			30.2878,
			4.99
		],
		[
			15.99174,
			-41.7444,
			4.99
		],
		[
			18.23162,
			64.3973,
			4.99
		],
		[
			19.40211,
			29.6213,
			4.99
		],
		[
			20.07211,
			-32.0563,
			4.99
		],
		[
			22.14054,
			-34.0438,
			4.99
		],
		[
			22.94055,
			49.7335,
			4.99
		],
		[
			23.31602,
			-9.6107,
			4.99
		],
		[
			4.07421,
			59.1555,
			5
		],
		[
			5.40707,
			17.3835,
			5
		],
		[
			6.12545,
			-37.2529,
			5
		],
		[
			6.26247,
			-13.7184,
			5
		],
		[
			6.93518,
			-14.0434,
			5
		],
		[
			7.30888,
			49.4648,
			5
		],
		[
			9.62019,
			6.8358,
			5
		],
		[
			11.38685,
			-36.1648,
			5
		],
		[
			11.72533,
			-62.4894,
			5
		],
		[
			15.52359,
			77.3494,
			5
		],
		[
			16.13459,
			17.047,
			5
		],
		[
			17.9848,
			-30.253,
			5
		],
		[
			18.12465,
			43.4619,
			5
		],
		[
			18.91865,
			-22.6713,
			5
		],
		[
			19.02399,
			46.9348,
			5
		],
		[
			19.23199,
			57.7051,
			5
		],
		[
			19.57636,
			19.7734,
			5
		],
		[
			19.77378,
			33.7276,
			5
		],
		[
			23.95975,
			-64.2982,
			5
		],
		[
			.17201,
			46.0723,
			5.01
		],
		[
			.46747,
			17.8931,
			5.01
		],
		[
			1.65583,
			44.3862,
			5.01
		],
		[
			5.03606,
			-26.275,
			5.01
		],
		[
			5.25677,
			32.6876,
			5.01
		],
		[
			6.18749,
			-65.5894,
			5.01
		],
		[
			6.29856,
			61.5153,
			5.01
		],
		[
			7.49688,
			27.9161,
			5.01
		],
		[
			7.87102,
			-34.7054,
			5.01
		],
		[
			8.57878,
			-49.9442,
			5.01
		],
		[
			9.56911,
			-51.2553,
			5.01
		],
		[
			10.71779,
			69.0762,
			5.01
		],
		[
			11.65822,
			-65.3978,
			5.01
		],
		[
			12.3166,
			-55.143,
			5.01
		],
		[
			12.43081,
			39.0186,
			5.01
		],
		[
			12.50185,
			69.2011,
			5.01
		],
		[
			17.33857,
			18.0571,
			5.01
		],
		[
			19.81629,
			19.142,
			5.01
		],
		[
			19.96584,
			-15.4915,
			5.01
		],
		[
			4.4806,
			13.0476,
			5.02
		],
		[
			5.41087,
			37.3853,
			5.02
		],
		[
			9.55346,
			-21.1157,
			5.02
		],
		[
			10.54913,
			-47.0034,
			5.02
		],
		[
			10.92899,
			33.5069,
			5.02
		],
		[
			13.94283,
			27.4921,
			5.02
		],
		[
			14.88085,
			-37.8032,
			5.02
		],
		[
			15.28497,
			71.8239,
			5.02
		],
		[
			17.81786,
			50.7811,
			5.02
		],
		[
			17.82417,
			76.9629,
			5.02
		],
		[
			18.35907,
			49.1216,
			5.02
		],
		[
			18.74721,
			2.06,
			5.02
		],
		[
			18.95569,
			-20.6563,
			5.02
		],
		[
			19.42125,
			-24.5086,
			5.02
		],
		[
			21.7956,
			-30.8983,
			5.02
		],
		[
			2.10943,
			22.6483,
			5.03
		],
		[
			4.83656,
			-16.2172,
			5.03
		],
		[
			6.05433,
			-26.2845,
			5.03
		],
		[
			7.28039,
			-36.5926,
			5.03
		],
		[
			7.7658,
			-14.5638,
			5.03
		],
		[
			8.49097,
			-44.7248,
			5.03
		],
		[
			10.99111,
			40.4303,
			5.03
		],
		[
			12.58549,
			18.3771,
			5.03
		],
		[
			13.69355,
			-8.703,
			5.03
		],
		[
			14.24921,
			-57.0861,
			5.03
		],
		[
			16.86257,
			24.6564,
			5.03
		],
		[
			17.03129,
			-32.1435,
			5.03
		],
		[
			17.31027,
			10.8645,
			5.03
		],
		[
			18.71054,
			55.5395,
			5.03
		],
		[
			19.38089,
			-54.4239,
			5.03
		],
		[
			19.51107,
			-2.7889,
			5.03
		],
		[
			19.84381,
			52.988,
			5.03
		],
		[
			20.90935,
			28.0576,
			5.03
		],
		[
			.03887,
			-29.7204,
			5.04
		],
		[
			1.13357,
			43.9421,
			5.04
		],
		[
			1.76841,
			-53.522,
			5.04
		],
		[
			3.27005,
			50.9377,
			5.04
		],
		[
			4.70097,
			-37.1443,
			5.04
		],
		[
			5.98453,
			-9.5583,
			5.04
		],
		[
			6.11761,
			-62.1546,
			5.04
		],
		[
			6.27406,
			12.2722,
			5.04
		],
		[
			6.71805,
			44.5244,
			5.04
		],
		[
			7.39125,
			25.0505,
			5.04
		],
		[
			7.65794,
			17.6745,
			5.04
		],
		[
			7.71586,
			-45.1731,
			5.04
		],
		[
			8.11121,
			-45.266,
			5.04
		],
		[
			12.07957,
			-76.5191,
			5.04
		],
		[
			13.20099,
			-16.1986,
			5.04
		],
		[
			13.41865,
			-74.8878,
			5.04
		],
		[
			13.49035,
			-51.1651,
			5.04
		],
		[
			15.28247,
			-60.9573,
			5.04
		],
		[
			15.32189,
			1.7654,
			5.04
		],
		[
			15.51549,
			40.833,
			5.04
		],
		[
			15.88891,
			-20.167,
			5.04
		],
		[
			21.30755,
			43.9459,
			5.04
		],
		[
			21.61583,
			40.4135,
			5.04
		],
		[
			21.98749,
			73.1799,
			5.04
		],
		[
			22.62927,
			-4.2281,
			5.04
		],
		[
			3.31879,
			50.095,
			5.05
		],
		[
			3.81978,
			24.1367,
			5.05
		],
		[
			5.08278,
			-49.5778,
			5.05
		],
		[
			5.33359,
			33.9581,
			5.05
		],
		[
			6.64379,
			-48.2202,
			5.05
		],
		[
			7.67513,
			87.0201,
			5.05
		],
		[
			8.65219,
			-22.6619,
			5.05
		],
		[
			18.11709,
			30.5621,
			5.05
		],
		[
			22.19183,
			59.4145,
			5.05
		],
		[
			23.15874,
			8.6772,
			5.05
		],
		[
			23.33905,
			5.3813,
			5.05
		],
		[
			23.79855,
			67.8068,
			5.05
		],
		[
			3.70259,
			63.2168,
			5.06
		],
		[
			5.25677,
			-26.9435,
			5.06
		],
		[
			5.36285,
			-24.773,
			5.06
		],
		[
			6.14563,
			-68.8434,
			5.06
		],
		[
			6.19773,
			-6.5503,
			5.06
		],
		[
			6.46599,
			-4.7622,
			5.06
		],
		[
			7.57184,
			-23.4737,
			5.06
		],
		[
			8.30523,
			-65.6132,
			5.06
		],
		[
			10.10311,
			-47.37,
			5.06
		],
		[
			11.01401,
			39.2121,
			5.06
		],
		[
			14.3731,
			-80.1089,
			5.06
		],
		[
			17.17842,
			-44.5577,
			5.06
		],
		[
			19.68061,
			45.5249,
			5.06
		],
		[
			19.70865,
			-16.124,
			5.06
		],
		[
			20.02265,
			50.1047,
			5.06
		],
		[
			20.6422,
			24.116,
			5.06
		],
		[
			20.8347,
			44.0593,
			5.06
		],
		[
			20.85835,
			-51.6082,
			5.06
		],
		[
			21.22237,
			-70.1263,
			5.06
		],
		[
			23.8748,
			19.1203,
			5.06
		],
		[
			.54553,
			-63.0315,
			5.07
		],
		[
			.81631,
			16.9406,
			5.07
		],
		[
			3.2129,
			-1.1961,
			5.07
		],
		[
			4.51391,
			-44.9537,
			5.07
		],
		[
			4.66519,
			53.0795,
			5.07
		],
		[
			5.40803,
			-.8913,
			5.07
		],
		[
			6.97364,
			-34.1117,
			5.07
		],
		[
			7.22285,
			16.159,
			5.07
		],
		[
			7.48901,
			28.1183,
			5.07
		],
		[
			7.79027,
			-38.5111,
			5.07
		],
		[
			9.53266,
			9.7158,
			5.07
		],
		[
			9.56483,
			-80.9413,
			5.07
		],
		[
			9.67177,
			-14.3323,
			5.07
		],
		[
			9.87512,
			-8.105,
			5.07
		],
		[
			10.58001,
			6.9537,
			5.07
		],
		[
			11.52947,
			-59.4421,
			5.07
		],
		[
			14.21279,
			-27.2612,
			5.07
		],
		[
			16.60381,
			52.9244,
			5.07
		],
		[
			17.15923,
			40.777,
			5.07
		],
		[
			17.53274,
			68.135,
			5.07
		],
		[
			18.53387,
			-45.7574,
			5.07
		],
		[
			19.11628,
			11.0712,
			5.07
		],
		[
			20.65216,
			10.0862,
			5.07
		],
		[
			21.83075,
			30.1742,
			5.07
		],
		[
			22.08577,
			62.2798,
			5.07
		],
		[
			.60231,
			54.1685,
			5.08
		],
		[
			3.80452,
			11.1433,
			5.08
		],
		[
			4.65256,
			15.7998,
			5.08
		],
		[
			4.85624,
			18.8399,
			5.08
		],
		[
			5.37598,
			79.2311,
			5.08
		],
		[
			5.4608,
			34.4759,
			5.08
		],
		[
			6.17069,
			-74.753,
			5.08
		],
		[
			6.79367,
			-8.9985,
			5.08
		],
		[
			7.95512,
			-44.1099,
			5.08
		],
		[
			8.46016,
			-53.0885,
			5.08
		],
		[
			9.80983,
			46.021,
			5.08
		],
		[
			10.50485,
			-.637,
			5.08
		],
		[
			10.56691,
			-23.7452,
			5.08
		],
		[
			10.6057,
			-59.5644,
			5.08
		],
		[
			10.7236,
			23.1884,
			5.08
		],
		[
			11.38941,
			-18.78,
			5.08
		],
		[
			12.91025,
			-57.1687,
			5.08
		],
		[
			14.94555,
			-62.781,
			5.08
		],
		[
			18.91197,
			-15.603,
			5.08
		],
		[
			20.11483,
			23.6144,
			5.08
		],
		[
			20.45533,
			-18.2117,
			5.08
		],
		[
			21.88827,
			-13.5518,
			5.08
		],
		[
			22.59615,
			73.6432,
			5.08
		],
		[
			.80984,
			-74.9234,
			5.09
		],
		[
			1.95585,
			17.8175,
			5.09
		],
		[
			3.50005,
			55.4518,
			5.09
		],
		[
			5.00575,
			81.1941,
			5.09
		],
		[
			6.56053,
			-1.2202,
			5.09
		],
		[
			7.36579,
			20.4437,
			5.09
		],
		[
			7.4394,
			-51.0185,
			5.09
		],
		[
			7.98492,
			-23.3104,
			5.09
		],
		[
			8.23287,
			-36.3223,
			5.09
		],
		[
			8.84263,
			-46.5292,
			5.09
		],
		[
			9.43832,
			-53.3789,
			5.09
		],
		[
			9.77546,
			57.1281,
			5.09
		],
		[
			9.83254,
			-45.7327,
			5.09
		],
		[
			11.38928,
			-64.9547,
			5.09
		],
		[
			12.26672,
			14.8991,
			5.09
		],
		[
			15.85433,
			-3.0905,
			5.09
		],
		[
			16.18391,
			-29.4162,
			5.09
		],
		[
			17.81365,
			25.6229,
			5.09
		],
		[
			18.37183,
			-38.6569,
			5.09
		],
		[
			20.08597,
			19.9911,
			5.09
		],
		[
			21.66975,
			43.2738,
			5.09
		],
		[
			21.88438,
			25.9251,
			5.09
		],
		[
			22.10054,
			45.0143,
			5.09
		],
		[
			22.3338,
			-80.4397,
			5.09
		],
		[
			23.04344,
			42.7578,
			5.09
		],
		[
			23.3846,
			12.3139,
			5.09
		],
		[
			23.72288,
			10.3315,
			5.09
		],
		[
			2.9548,
			31.9342,
			5.1
		],
		[
			3.37923,
			20.7421,
			5.1
		],
		[
			4.16743,
			80.6987,
			5.1
		],
		[
			4.39773,
			9.461,
			5.1
		],
		[
			5.83153,
			-66.9012,
			5.1
		],
		[
			11.81252,
			-26.7498,
			5.1
		],
		[
			13.28143,
			-31.5062,
			5.1
		],
		[
			14.40315,
			5.8201,
			5.1
		],
		[
			16.02065,
			17.8184,
			5.1
		],
		[
			16.77777,
			-67.1097,
			5.1
		],
		[
			17.40363,
			-44.1626,
			5.1
		],
		[
			18.14802,
			20.0452,
			5.1
		],
		[
			19.30903,
			1.0851,
			5.1
		],
		[
			21.65924,
			2.2436,
			5.1
		],
		[
			21.75007,
			-9.0824,
			5.1
		],
		[
			23.00142,
			56.9454,
			5.1
		],
		[
			23.86847,
			-82.0188,
			5.1
		],
		[
			1.49337,
			-21.6293,
			5.11
		],
		[
			3.89415,
			-34.7323,
			5.11
		],
		[
			5.14547,
			-4.4562,
			5.11
		],
		[
			6.89507,
			68.8883,
			5.11
		],
		[
			7.31061,
			-36.7427,
			5.11
		],
		[
			9.96141,
			41.0556,
			5.11
		],
		[
			11.14278,
			-61.9472,
			5.11
		],
		[
			13.43549,
			-39.7551,
			5.11
		],
		[
			15.92489,
			-68.603,
			5.11
		],
		[
			18.40383,
			39.5072,
			5.11
		],
		[
			18.72971,
			-38.3234,
			5.11
		],
		[
			19.15275,
			76.5605,
			5.11
		],
		[
			20.6674,
			-60.5489,
			5.11
		],
		[
			20.80809,
			-43.9885,
			5.11
		],
		[
			21.94421,
			63.6256,
			5.11
		],
		[
			22.27405,
			-41.6272,
			5.11
		],
		[
			22.64387,
			56.7956,
			5.11
		],
		[
			22.73485,
			41.8192,
			5.11
		],
		[
			1.90612,
			-42.4969,
			5.12
		],
		[
			3.06023,
			-59.7378,
			5.12
		],
		[
			5.11268,
			-4.6552,
			5.12
		],
		[
			7.17985,
			-48.9321,
			5.12
		],
		[
			7.36739,
			36.7606,
			5.12
		],
		[
			7.72831,
			-40.9337,
			5.12
		],
		[
			7.86167,
			1.7669,
			5.12
		],
		[
			9.27307,
			-44.2657,
			5.12
		],
		[
			9.56237,
			-49.0051,
			5.12
		],
		[
			10.69904,
			65.7163,
			5.12
		],
		[
			10.8929,
			54.5851,
			5.12
		],
		[
			11.53022,
			-59.5156,
			5.12
		],
		[
			12.59598,
			-41.0219,
			5.12
		],
		[
			12.77743,
			16.5777,
			5.12
		],
		[
			17.73575,
			-51.8341,
			5.12
		],
		[
			18.35029,
			28.87,
			5.12
		],
		[
			18.52397,
			-18.4027,
			5.12
		],
		[
			18.584,
			-10.9772,
			5.12
		],
		[
			19.51261,
			27.9653,
			5.12
		],
		[
			19.58535,
			-10.5604,
			5.12
		],
		[
			19.85045,
			10.4157,
			5.12
		],
		[
			20.5653,
			-44.516,
			5.12
		],
		[
			22.35988,
			-21.5982,
			5.12
		],
		[
			23.05828,
			-34.7494,
			5.12
		],
		[
			.0304,
			-3.0275,
			5.13
		],
		[
			.24101,
			-7.7805,
			5.13
		],
		[
			1.29665,
			3.6145,
			5.13
		],
		[
			2.46714,
			-33.811,
			5.13
		],
		[
			3.41127,
			64.586,
			5.13
		],
		[
			5.58791,
			-5.3897,
			5.13
		],
		[
			8.33441,
			27.2177,
			5.13
		],
		[
			8.43188,
			7.5645,
			5.13
		],
		[
			11.54837,
			-31.0872,
			5.13
		],
		[
			14.13215,
			43.8545,
			5.13
		],
		[
			15.08866,
			-41.0672,
			5.13
		],
		[
			15.57703,
			-28.047,
			5.13
		],
		[
			16.25425,
			-47.372,
			5.13
		],
		[
			17.34839,
			24.4994,
			5.13
		],
		[
			19.19461,
			56.8592,
			5.13
		],
		[
			21.07863,
			-77.0238,
			5.13
		],
		[
			23.98216,
			-52.7458,
			5.13
		],
		[
			.6129,
			44.4886,
			5.14
		],
		[
			1.24001,
			-7.9228,
			5.14
		],
		[
			3.5068,
			11.3364,
			5.14
		],
		[
			3.82575,
			33.0914,
			5.14
		],
		[
			5.43869,
			-58.9125,
			5.14
		],
		[
			6.0576,
			19.6906,
			5.14
		],
		[
			6.83184,
			-46.6146,
			5.14
		],
		[
			6.84919,
			67.5719,
			5.14
		],
		[
			7.0143,
			-51.4026,
			5.14
		],
		[
			7.06057,
			10.9518,
			5.14
		],
		[
			7.07176,
			-56.7497,
			5.14
		],
		[
			7.6213,
			-4.111,
			5.14
		],
		[
			7.79175,
			33.4157,
			5.14
		],
		[
			7.96437,
			-45.5777,
			5.14
		],
		[
			8.08458,
			13.1182,
			5.14
		],
		[
			8.22671,
			-46.9916,
			5.14
		],
		[
			10.78263,
			-56.7572,
			5.14
		],
		[
			11.47641,
			-42.6742,
			5.14
		],
		[
			11.61681,
			-61.2834,
			5.14
		],
		[
			12.20332,
			77.6162,
			5.14
		],
		[
			12.34881,
			-13.5657,
			5.14
		],
		[
			13.30403,
			49.6821,
			5.14
		],
		[
			14.32569,
			-2.2655,
			5.14
		],
		[
			15.58748,
			39.0101,
			5.14
		],
		[
			15.94819,
			-33.9661,
			5.14
		],
		[
			17.30019,
			-24.2869,
			5.14
		],
		[
			18.97679,
			-60.2005,
			5.14
		],
		[
			19.22853,
			2.2937,
			5.14
		],
		[
			19.42461,
			19.7984,
			5.14
		],
		[
			19.88816,
			57.5235,
			5.14
		],
		[
			20.31085,
			34.9828,
			5.14
		],
		[
			20.69919,
			-66.7607,
			5.14
		],
		[
			1.18521,
			31.4247,
			5.15
		],
		[
			2.02844,
			-44.7135,
			5.15
		],
		[
			2.53505,
			36.1473,
			5.15
		],
		[
			6.29492,
			-16.8159,
			5.15
		],
		[
			7.77758,
			37.5174,
			5.15
		],
		[
			8.72785,
			-49.8228,
			5.15
		],
		[
			8.86579,
			43.7266,
			5.15
		],
		[
			9.13986,
			66.8732,
			5.15
		],
		[
			9.71589,
			72.2526,
			5.15
		],
		[
			10.22517,
			-66.3728,
			5.15
		],
		[
			11.1213,
			-42.6387,
			5.15
		],
		[
			11.63536,
			-61.8266,
			5.15
		],
		[
			12.06099,
			-42.4341,
			5.15
		],
		[
			12.36871,
			-67.5221,
			5.15
		],
		[
			13.13161,
			-10.7404,
			5.15
		],
		[
			13.78232,
			-36.2519,
			5.15
		],
		[
			14.76669,
			-25.4432,
			5.15
		],
		[
			14.84477,
			-15.9972,
			5.15
		],
		[
			15.24398,
			67.3467,
			5.15
		],
		[
			15.26779,
			-41.4912,
			5.15
		],
		[
			15.47729,
			1.8421,
			5.15
		],
		[
			16.76386,
			8.5826,
			5.15
		],
		[
			19.99867,
			37.0429,
			5.15
		],
		[
			20.65691,
			.4864,
			5.15
		],
		[
			20.66749,
			-18.1387,
			5.15
		],
		[
			20.77746,
			16.1241,
			5.15
		],
		[
			23.19561,
			8.7201,
			5.15
		],
		[
			.35202,
			37.9686,
			5.16
		],
		[
			2.37262,
			55.8457,
			5.16
		],
		[
			2.94373,
			-3.7123,
			5.16
		],
		[
			3.31049,
			50.2222,
			5.16
		],
		[
			5.84812,
			-52.1089,
			5.16
		],
		[
			6.52307,
			-12.392,
			5.16
		],
		[
			7.86286,
			-13.898,
			5.16
		],
		[
			8.25442,
			-62.9156,
			5.16
		],
		[
			9.15598,
			22.0454,
			5.16
		],
		[
			10.58603,
			57.0826,
			5.16
		],
		[
			13.91171,
			-1.5031,
			5.16
		],
		[
			15.08005,
			-64.0314,
			5.16
		],
		[
			15.42983,
			15.428,
			5.16
		],
		[
			15.57403,
			-9.1834,
			5.16
		],
		[
			18.53926,
			-39.704,
			5.16
		],
		[
			21.38156,
			6.8111,
			5.16
		],
		[
			21.69246,
			-14.0476,
			5.16
		],
		[
			22.87335,
			9.8357,
			5.16
		],
		[
			.50629,
			-23.7877,
			5.17
		],
		[
			.83544,
			-10.6443,
			5.17
		],
		[
			1.13789,
			54.9203,
			5.17
		],
		[
			2.6339,
			72.8183,
			5.17
		],
		[
			2.74933,
			12.4458,
			5.17
		],
		[
			4.39468,
			-3.7455,
			5.17
		],
		[
			7.82811,
			-17.2284,
			5.17
		],
		[
			8.98121,
			-47.2347,
			5.17
		],
		[
			8.99005,
			-59.0837,
			5.17
		],
		[
			11.9336,
			-17.1508,
			5.17
		],
		[
			12.13052,
			-75.367,
			5.17
		],
		[
			12.40515,
			26.0986,
			5.17
		],
		[
			12.68777,
			-13.0139,
			5.17
		],
		[
			12.95121,
			-51.1988,
			5.17
		],
		[
			17.88834,
			40.008,
			5.17
		],
		[
			19.10554,
			-52.3409,
			5.17
		],
		[
			19.41617,
			11.9444,
			5.17
		],
		[
			19.43587,
			36.3179,
			5.17
		],
		[
			19.61055,
			44.6949,
			5.17
		],
		[
			21.08729,
			-54.727,
			5.17
		],
		[
			21.26053,
			-20.6517,
			5.17
		],
		[
			23.85593,
			-18.9092,
			5.17
		],
		[
			.35867,
			-28.9815,
			5.18
		],
		[
			.47046,
			44.3945,
			5.18
		],
		[
			1.71552,
			70.6225,
			5.18
		],
		[
			4.11011,
			27.5999,
			5.18
		],
		[
			4.91303,
			11.426,
			5.18
		],
		[
			5.19488,
			16.0457,
			5.18
		],
		[
			5.53139,
			-76.341,
			5.18
		],
		[
			5.66228,
			25.8971,
			5.18
		],
		[
			5.76664,
			-32.3064,
			5.18
		],
		[
			6.99737,
			-67.9164,
			5.18
		],
		[
			7.41116,
			-16.2015,
			5.18
		],
		[
			8.35585,
			-36.4842,
			5.18
		],
		[
			8.42537,
			-51.7274,
			5.18
		],
		[
			8.666,
			-53.0547,
			5.18
		],
		[
			9.23904,
			61.4233,
			5.18
		],
		[
			10.7258,
			46.2039,
			5.18
		],
		[
			11.28817,
			2.0106,
			5.18
		],
		[
			11.42865,
			-63.9725,
			5.18
		],
		[
			14.20111,
			69.4325,
			5.18
		],
		[
			14.92627,
			-60.1142,
			5.18
		],
		[
			18.87768,
			-52.1074,
			5.18
		],
		[
			19.65323,
			5.3978,
			5.18
		],
		[
			19.84277,
			38.7224,
			5.18
		],
		[
			20.2584,
			23.5089,
			5.18
		],
		[
			20.52511,
			74.9546,
			5.18
		],
		[
			21.71779,
			72.3201,
			5.18
		],
		[
			23.78777,
			-50.2265,
			5.18
		],
		[
			2.37571,
			-23.8163,
			5.19
		],
		[
			2.40692,
			50.0065,
			5.19
		],
		[
			5.12612,
			-63.3997,
			5.19
		],
		[
			6.07042,
			-6.7089,
			5.19
		],
		[
			6.45382,
			.2992,
			5.19
		],
		[
			7.99376,
			-60.5871,
			5.19
		],
		[
			8.65143,
			-70.3867,
			5.19
		],
		[
			8.83097,
			-32.7805,
			5.19
		],
		[
			10.49131,
			-2.7391,
			5.19
		],
		[
			11.60078,
			69.323,
			5.19
		],
		[
			13.27959,
			9.4242,
			5.19
		],
		[
			15.11045,
			-16.2568,
			5.19
		],
		[
			15.77778,
			62.5996,
			5.19
		],
		[
			16.51371,
			-61.6335,
			5.19
		],
		[
			17.43335,
			-50.6335,
			5.19
		],
		[
			20.23737,
			28.6948,
			5.19
		],
		[
			20.92686,
			13.7215,
			5.19
		],
		[
			21.32284,
			64.8719,
			5.19
		],
		[
			22.64418,
			63.5845,
			5.19
		],
		[
			23.31843,
			-13.4547,
			5.19
		],
		[
			23.37755,
			-15.0393,
			5.19
		],
		[
			.50205,
			29.7516,
			5.2
		],
		[
			.58747,
			-3.5928,
			5.2
		],
		[
			4.27863,
			53.6118,
			5.2
		],
		[
			4.5699,
			-8.2314,
			5.2
		],
		[
			5.91606,
			59.8884,
			5.2
		],
		[
			6.24747,
			19.1564,
			5.2
		],
		[
			6.49125,
			-56.8528,
			5.2
		],
		[
			6.70676,
			17.6453,
			5.2
		],
		[
			7.04022,
			24.2154,
			5.2
		],
		[
			7.06744,
			-42.3373,
			5.2
		],
		[
			7.26525,
			59.6375,
			5.2
		],
		[
			7.46232,
			21.4452,
			5.2
		],
		[
			8.15997,
			-44.1228,
			5.2
		],
		[
			8.67199,
			-40.2639,
			5.2
		],
		[
			8.69914,
			-45.4107,
			5.2
		],
		[
			11.69554,
			-32.4994,
			5.2
		],
		[
			12.34268,
			-22.2159,
			5.2
		],
		[
			13.09567,
			35.7989,
			5.2
		],
		[
			13.97532,
			-24.9722,
			5.2
		],
		[
			16.37262,
			33.7991,
			5.2
		],
		[
			18.45347,
			.1961,
			5.2
		],
		[
			18.79573,
			-40.4062,
			5.2
		],
		[
			18.95045,
			32.9013,
			5.2
		],
		[
			19.12377,
			32.5017,
			5.2
		],
		[
			21.10685,
			-32.3416,
			5.2
		],
		[
			21.11499,
			38.7494,
			5.2
		],
		[
			23.31852,
			-13.4586,
			5.2
		]
	],
	lines: [
		[
			[2.06499, 42.3297],
			[1.1622, 35.6206],
			[.65547, 30.861],
			[.13979, 29.0904]
		],
		[
			[.95345, 23.4176],
			[.78898, 24.2672],
			[.64259, 29.3118],
			[.65547, 30.861],
			[.61468, 33.7193],
			[23.63561, 43.2681],
			[23.03202, 42.326]
		],
		[
			[23.63561, 43.2681],
			[23.67347, 44.3339],
			[23.62607, 46.4582]
		],
		[
			[1.1622, 35.6206],
			[.94589, 38.4993],
			[.83023, 41.0789],
			[1.15837, 47.2418],
			[1.63321, 48.6282]
		],
		[[23.67347, 44.3339], [23.76723, 46.4203]],
		[
			[9.48742, -35.9513],
			[10.45253, -31.0678],
			[10.94529, -37.1378]
		],
		[
			[14.7977, -79.0448],
			[16.33911, -78.6957],
			[16.71796, -77.5174],
			[16.55752, -78.8971]
		],
		[
			[20.7946, -9.4958],
			[20.87757, -8.9833],
			[21.52598, -5.5712],
			[22.0964, -.3199],
			[22.36094, -1.3873],
			[22.48053, -.02],
			[22.58927, -.1175],
			[22.87691, -7.5796],
			[23.29839, -9.1825],
			[23.15745, -21.1724]
		],
		[[21.52598, -5.5712], [22.10729, -13.8697]],
		[[22.0964, -.3199], [22.28057, -7.7833]],
		[[22.48053, -.02], [22.42129, 1.3774]],
		[
			[23.38284, -20.1006],
			[23.29839, -9.1825],
			[23.69606, -17.8165]
		],
		[
			[19.77099, 10.6133],
			[19.84639, 8.8683],
			[19.92189, 6.4068],
			[20.18841, -.8215],
			[19.87455, 1.0057],
			[19.42497, 3.1148],
			[19.09017, 13.8635],
			[19.84639, 8.8683],
			[19.42497, 3.1148],
			[19.10415, -4.8826]
		],
		[
			[17.42324, -56.3777],
			[17.51831, -60.6838],
			[16.82977, -59.0414],
			[16.977, -55.9901],
			[16.99307, -53.1604],
			[17.53069, -49.8761],
			[17.42167, -55.5299]
		],
		[
			[2.83307, 27.2605],
			[2.11956, 23.4624],
			[1.91067, 20.808],
			[1.89217, 19.2939]
		],
		[
			[5.99215, 44.9474],
			[5.27815, 45.998],
			[5.10858, 41.2345],
			[4.94989, 33.1661],
			[5.4382, 28.6075],
			[5.99535, 37.2126],
			[5.99215, 44.9474],
			[5.99212, 54.2847],
			[5.27815, 45.998],
			[5.03281, 43.8233],
			[5.0413, 41.0758]
		],
		[
			[13.78771, 17.4569],
			[13.91141, 18.3977],
			[14.26102, 19.1824],
			[14.5305, 30.3714],
			[14.53463, 38.3083],
			[15.03243, 40.3906],
			[15.25838, 33.3148],
			[14.74978, 27.0742],
			[14.26102, 19.1824],
			[14.68582, 13.7283]
		],
		[
			[14.53463, 38.3083],
			[14.27306, 46.0883],
			[14.22439, 51.7879],
			[14.41995, 51.8507],
			[14.27306, 46.0883]
		],
		[
			[4.51391, -44.9537],
			[4.67603, -41.8638],
			[4.70097, -37.1443],
			[5.07345, -35.483]
		],
		[
			[4.95478, 53.7521],
			[5.05697, 60.4422],
			[4.90083, 66.3427],
			[3.83931, 71.3323],
			[3.82535, 65.526],
			[3.48448, 59.9403]
		],
		[
			[4.90083, 66.3427],
			[6.31411, 69.3198],
			[7.00112, 76.9774]
		],
		[
			[8.97479, 11.8577],
			[8.74475, 18.1543],
			[8.72143, 21.4685],
			[8.77777, 28.7651]
		],
		[[8.74475, 18.1543], [8.27525, 9.1855]],
		[[12.93346, 38.3149], [12.56237, 41.3575]],
		[
			[6.37833, -17.9559],
			[6.75248, -16.7161],
			[7.05041, -23.8333],
			[7.13986, -26.3932],
			[7.02865, -27.9348],
			[6.9771, -28.9721],
			[6.33855, -30.0634]
		],
		[[7.40159, -29.3031], [7.13986, -26.3932]],
		[
			[6.75248, -16.7161],
			[6.93562, -17.0542],
			[7.06264, -15.6333],
			[6.90317, -12.0386],
			[6.93562, -17.0542]
		],
		[[7.65503, 5.225], [7.45251, 8.2893]],
		[
			[20.29413, -12.5082],
			[20.35019, -14.7814],
			[20.48101, -17.8137],
			[20.76826, -25.2709],
			[20.86369, -26.9191],
			[21.44445, -22.4113],
			[21.78401, -16.1273],
			[21.66818, -16.6623],
			[21.37078, -16.8345],
			[21.09912, -17.2329],
			[20.29413, -12.5082]
		],
		[
			[6.62935, -43.1959],
			[6.3992, -52.6957],
			[9.21999, -69.7172],
			[10.22895, -70.0379],
			[10.71595, -64.3945],
			[10.53374, -61.6853],
			[10.28471, -61.3323],
			[9.28483, -59.2752],
			[8.37523, -59.5095],
			[7.94631, -52.9824],
			[8.15887, -47.3366],
			[8.74506, -54.7088],
			[9.28483, -59.2752]
		],
		[
			[10.71595, -64.3945],
			[11.10901, -62.4241],
			[11.14278, -61.9472],
			[11.21001, -60.3176],
			[11.14317, -58.975],
			[10.89157, -58.8532],
			[10.53374, -61.6853]
		],
		[
			[1.90659, 63.6701],
			[1.43027, 60.2353],
			[.94515, 60.7167],
			[.67512, 56.5373],
			[.15297, 59.1498]
		],
		[
			[11.35011, -54.491],
			[12.13931, -50.7224],
			[12.46733, -50.2306],
			[12.69195, -48.9599],
			[13.66479, -53.4664],
			[13.92566, -47.2884],
			[13.82694, -42.4737],
			[13.82508, -41.6877],
			[14.11137, -36.37],
			[14.59179, -42.1578],
			[14.98603, -42.1042]
		],
		[[13.82508, -41.6877], [13.34328, -36.7123]],
		[
			[14.65975, -60.8372],
			[13.66479, -53.4664],
			[14.06373, -60.373]
		],
		[
			[12.46733, -50.2306],
			[12.1942, -52.3685],
			[11.52947, -59.4421]
		],
		[
			[20.49303, 62.9941],
			[20.75483, 61.8388],
			[21.30966, 62.5856],
			[21.72513, 58.78],
			[22.25061, 57.0436],
			[22.18091, 58.2013],
			[22.48619, 58.4152],
			[22.82801, 66.2004],
			[23.65579, 77.6323],
			[21.47767, 70.5607],
			[21.30966, 62.5856]
		],
		[[21.47767, 70.5607], [22.82801, 66.2004]],
		[
			[2.72168, 3.2358],
			[2.59791, 5.5932],
			[2.46932, 8.4601],
			[2.74904, 10.1141],
			[2.99525, 8.9074],
			[3.03799, 4.0897],
			[2.72168, 3.2358],
			[2.65805, .3285],
			[2.32244, -2.9776],
			[1.85767, -10.335],
			[1.73447, -15.9375],
			[.72649, -17.9866],
			[.3238, -8.8239],
			[1.14317, -10.1823],
			[1.40039, -8.1833],
			[1.85767, -10.335]
		],
		[
			[8.30877, -76.9197],
			[10.59114, -78.6078],
			[10.75453, -80.4696],
			[12.30579, -79.3122],
			[11.99377, -78.2218],
			[10.59114, -78.6078]
		],
		[
			[15.2919, -58.8012],
			[14.70845, -64.9751],
			[15.38963, -59.3208]
		],
		[
			[6.36857, -33.4364],
			[5.84933, -35.7683],
			[5.66081, -34.0741],
			[5.52021, -35.4705]
		],
		[[5.84933, -35.7683], [5.98578, -42.8151]],
		[
			[13.16647, 17.5294],
			[13.19789, 27.8782],
			[12.44897, 28.2684]
		],
		[
			[18.97871, -37.1074],
			[19.10697, -37.0634],
			[19.15787, -37.9045],
			[19.16715, -39.3408],
			[19.13916, -40.4967],
			[19.05191, -42.0951],
			[18.82639, -43.4341],
			[18.55839, -42.3125]
		],
		[
			[15.54883, 31.3591],
			[15.46381, 29.1057],
			[15.57813, 26.7147],
			[15.71238, 26.2956],
			[15.82657, 26.0684],
			[15.95979, 26.8779],
			[16.02405, 29.8511]
		],
		[
			[12.14023, -24.7289],
			[12.16875, -22.6198],
			[12.26343, -17.5419],
			[12.49774, -16.5154],
			[12.57312, -23.3968],
			[12.16875, -22.6198]
		],
		[
			[11.61137, -9.8022],
			[11.41017, -10.8593],
			[11.32235, -14.7785],
			[10.99624, -18.2988],
			[11.1943, -22.8258],
			[11.38941, -18.78],
			[11.4147, -17.684],
			[11.74605, -18.3507],
			[11.9336, -17.1508]
		],
		[[11.32235, -14.7785], [11.4147, -17.684]],
		[[12.79535, -59.6888], [12.25242, -58.7489]],
		[[12.44331, -63.0991], [12.51943, -57.1132]],
		[
			[21.21561, 30.2269],
			[20.77019, 33.9703],
			[20.37047, 40.2567],
			[19.74958, 45.1308],
			[19.4951, 51.7298],
			[19.28505, 53.3685]
		],
		[
			[20.69053, 45.2803],
			[20.37047, 40.2567],
			[19.93843, 35.0834],
			[19.51202, 27.9597]
		],
		[
			[20.55355, 11.3033],
			[20.62582, 14.5951],
			[20.66063, 15.9121],
			[20.77746, 16.1241],
			[20.72431, 15.0746],
			[20.62582, 14.5951]
		],
		[
			[4.26711, -51.4866],
			[4.56661, -55.045],
			[5.56042, -62.4898],
			[5.74621, -65.7355],
			[5.90168, -63.0896],
			[5.56042, -62.4898],
			[5.09185, -57.4727],
			[4.56661, -55.045]
		],
		[
			[17.89215, 56.8726],
			[17.94343, 51.4889],
			[17.50721, 52.3014],
			[17.53779, 55.173],
			[17.89215, 56.8726],
			[19.20925, 67.6615],
			[18.34595, 71.3378],
			[17.14644, 65.7147],
			[16.39986, 61.5142],
			[16.03149, 58.5653],
			[15.41549, 58.9661],
			[14.07315, 64.3759],
			[12.55804, 69.7882],
			[11.52339, 69.3311]
		],
		[[18.34595, 71.3378], [18.35094, 72.7328]],
		[[19.20925, 67.6615], [19.80287, 70.2679]],
		[
			[21.26373, 5.2478],
			[21.24134, 10.007],
			[21.17236, 10.1316]
		],
		[
			[5.13083, -5.0864],
			[4.75837, -3.2547],
			[4.60532, -3.3525],
			[4.19776, -6.8376],
			[3.96716, -13.5085],
			[3.76904, -12.1016],
			[3.72081, -9.7634],
			[3.54885, -9.4583],
			[2.94046, -8.8981],
			[2.73537, -13.8587],
			[2.75172, -18.5726],
			[3.03986, -23.6245],
			[3.32528, -21.7579],
			[3.56313, -21.6329],
			[3.7808, -23.2497],
			[4.59251, -30.5623],
			[4.40061, -34.0168],
			[4.29824, -33.7983],
			[3.82423, -36.2003],
			[3.61825, -40.2745],
			[3.33213, -43.0698],
			[2.97102, -40.3047],
			[2.67779, -39.8554],
			[2.44975, -47.7038],
			[2.27516, -51.5122],
			[1.93263, -51.6089],
			[1.62857, -57.2368]
		],
		[
			[3.20126, -28.9876],
			[2.81817, -32.4059],
			[2.07485, -29.2968]
		],
		[
			[6.24796, 22.5068],
			[6.38267, 22.5136],
			[6.7322, 25.1311],
			[7.18566, 30.2452],
			[7.57663, 31.8883],
			[7.75527, 28.0262],
			[7.59871, 26.8957],
			[7.33538, 21.9823],
			[7.06848, 20.5703],
			[6.62853, 16.3993],
			[6.75483, 12.8956]
		],
		[[7.33538, 21.9823], [7.30155, 16.5404]],
		[
			[23.01467, -52.7541],
			[22.80925, -51.3169],
			[22.71113, -46.8846],
			[22.49595, -43.7492],
			[22.13722, -46.961],
			[22.71113, -46.8846]
		],
		[
			[22.48783, -43.4956],
			[22.26025, -41.3467],
			[22.10191, -39.5434],
			[21.89881, -37.3649]
		],
		[
			[16.36534, 19.1531],
			[16.50367, 21.4896],
			[16.6881, 31.6027],
			[16.71493, 38.9223],
			[16.56839, 42.437],
			[16.32901, 46.3134],
			[16.14616, 44.9349],
			[15.87793, 42.4515]
		],
		[[16.6881, 31.6027], [17.00483, 30.9264]],
		[[16.71493, 38.9223], [17.25079, 36.8092]],
		[
			[17.93755, 37.2505],
			[17.39471, 37.1459],
			[17.25079, 36.8092],
			[17.00483, 30.9264],
			[17.25053, 24.8392],
			[17.77431, 27.7207],
			[17.96275, 29.2479],
			[18.12571, 28.7625]
		],
		[[17.24413, 14.3903], [16.50367, 21.4896]],
		[
			[4.23337, -42.2944],
			[2.70929, -50.8003],
			[2.62343, -52.5431],
			[2.67767, -54.5499],
			[3.06023, -59.7378],
			[2.97995, -64.0713]
		],
		[
			[8.77959, 6.4188],
			[8.80721, 5.8378],
			[8.72041, 3.3987],
			[8.64595, 3.3414],
			[8.6276, 5.7038],
			[8.77959, 6.4188],
			[8.92323, 5.9456],
			[9.23941, 2.3143],
			[9.66427, -1.1428],
			[9.45979, -8.6586],
			[9.85797, -14.8466],
			[10.17647, -12.3541],
			[10.43484, -16.8363],
			[10.82708, -16.1936],
			[11.55003, -31.8576],
			[11.88181, -33.9081],
			[13.31536, -23.1715],
			[14.10619, -26.6824],
			[14.83814, -27.9604]
		],
		[
			[.42919, -77.2542],
			[3.78732, -74.239],
			[2.65982, -68.2669],
			[2.36249, -68.6594],
			[1.91559, -67.6473],
			[1.9795, -61.5699]
		],
		[
			[20.62612, -47.2915],
			[20.73398, -51.921],
			[20.9135, -58.4542],
			[21.9653, -54.9926],
			[21.33111, -53.4494],
			[20.62612, -47.2915]
		],
		[
			[22.39267, 52.229],
			[22.52153, 50.2825],
			[22.49217, 47.7069],
			[22.35043, 46.5366],
			[22.50813, 43.1234],
			[22.67524, 44.2763],
			[22.49217, 47.7069],
			[22.40861, 49.4764],
			[22.39267, 52.229]
		],
		[
			[22.50813, 43.1234],
			[22.23131, 39.7149],
			[22.26616, 37.7487]
		],
		[
			[10.13953, 11.9672],
			[10.12221, 16.7627],
			[10.33287, 19.8415],
			[11.23514, 20.5237],
			[11.81766, 14.5721],
			[11.23733, 15.4296],
			[10.13953, 11.9672]
		],
		[
			[10.33287, 19.8415],
			[10.27817, 23.4173],
			[9.87939, 26.007],
			[9.76419, 23.7743]
		],
		[
			[10.12382, 35.2447],
			[10.43189, 33.7961],
			[10.88853, 34.2149],
			[10.46472, 36.7072],
			[10.12382, 35.2447],
			[9.57039, 36.3976]
		],
		[
			[6.10259, -14.9353],
			[5.94008, -14.1677],
			[5.78259, -14.822],
			[5.54551, -17.8223],
			[5.21553, -16.2055],
			[5.09102, -22.371],
			[5.47075, -20.7594],
			[5.74105, -22.4484],
			[5.85536, -20.8791]
		],
		[
			[5.22052, -12.9413],
			[5.21553, -16.2055],
			[5.32626, -13.1768]
		],
		[
			[15.06784, -25.282],
			[14.84797, -16.0418],
			[15.28345, -9.3829],
			[15.59211, -14.7895],
			[15.61707, -28.1351],
			[15.64427, -29.7778]
		],
		[[14.84797, -16.0418], [15.59211, -14.7895]],
		[
			[15.84931, -33.6272],
			[15.66277, -34.4119],
			[15.36343, -36.2614],
			[15.3562, -40.6475],
			[14.97553, -43.134],
			[14.69882, -47.3882],
			[15.20475, -52.0992],
			[15.30889, -47.8753],
			[15.37802, -44.6896],
			[15.58568, -41.1668],
			[16.00203, -38.3967],
			[16.10987, -36.8023]
		],
		[[15.3562, -40.6475], [15.58568, -41.1668]],
		[
			[6.32705, 59.011],
			[6.95461, 58.4228],
			[7.44523, 49.2115],
			[8.38059, 43.1881],
			[9.01066, 41.7829],
			[9.31407, 36.8026],
			[9.35092, 34.3926]
		],
		[
			[18.74621, 37.6051],
			[18.73966, 39.6127],
			[18.61565, 38.7837],
			[18.74621, 37.6051],
			[18.90841, 36.8986],
			[18.98239, 32.6896],
			[18.83467, 33.3627],
			[18.74621, 37.6051]
		],
		[
			[6.17069, -74.753],
			[5.53139, -76.341],
			[4.91978, -74.9369],
			[5.04528, -71.3143]
		],
		[
			[20.8328, -33.7797],
			[20.80809, -43.9885],
			[21.34601, -40.8095],
			[21.29897, -32.1725],
			[21.02152, -32.2578],
			[20.8328, -33.7797]
		],
		[
			[7.68745, -9.5511],
			[8.14323, -2.9838],
			[7.19774, -.4928],
			[6.4803, -7.0331],
			[6.24759, -6.2748]
		],
		[
			[7.19774, -.4928],
			[6.79768, 2.4122],
			[6.39613, 4.5929],
			[6.54839, 7.333],
			[6.68296, 9.8958]
		],
		[
			[11.76011, -66.7288],
			[12.29285, -67.9607],
			[12.61973, -69.1356],
			[12.77133, -68.1081],
			[13.03785, -71.5489],
			[12.54111, -72.133],
			[12.61973, -69.1356]
		],
		[
			[16.10818, -45.1732],
			[16.45307, -47.5548],
			[16.33067, -50.1555],
			[16.05358, -49.2297],
			[16.10818, -45.1732]
		],
		[
			[14.44867, -83.6679],
			[22.76764, -81.3816],
			[21.69129, -77.39],
			[14.44867, -83.6679]
		],
		[
			[17.98377, -9.7736],
			[17.79821, 2.7073],
			[17.72454, 4.5673],
			[17.58224, 12.56],
			[16.96114, 9.375],
			[16.51523, 1.9839],
			[16.23909, -3.6943],
			[16.30536, -4.6925],
			[16.61931, -10.5671],
			[17.17297, -15.7249]
		],
		[
			[16.96114, 9.375],
			[16.61931, -10.5671],
			[16.51899, -16.6127],
			[16.4504, -18.4563],
			[16.40172, -20.0373],
			[16.42642, -23.4472]
		],
		[
			[17.72454, 4.5673],
			[17.17297, -15.7249],
			[17.36683, -24.9995],
			[17.45591, -29.867]
		],
		[
			[6.1262, 14.7685],
			[5.90639, 20.2762],
			[6.06533, 20.1385],
			[6.199, 14.2088],
			[6.03972, 9.6473],
			[5.91953, 7.4071],
			[5.41885, 6.3497],
			[4.91493, 10.1508]
		],
		[
			[4.97581, 1.714],
			[4.90419, 2.4407],
			[4.85343, 5.6051],
			[4.83067, 6.9613],
			[4.84353, 8.9002],
			[4.91493, 10.1508],
			[4.93952, 13.5145],
			[5.07615, 15.4041],
			[5.16165, 15.5972]
		],
		[
			[5.2423, -8.2016],
			[5.40795, -2.3971],
			[5.53345, -.2991],
			[5.41885, 6.3497],
			[5.58563, 9.9342],
			[5.91953, 7.4071],
			[5.67931, -1.9426],
			[5.79594, -9.6696]
		],
		[
			[5.67931, -1.9426],
			[5.60356, -1.2019],
			[5.53345, -.2991]
		],
		[
			[20.42746, -56.7351],
			[20.74931, -66.2032],
			[20.14545, -66.1821],
			[18.87029, -62.1876],
			[18.38712, -61.4939],
			[18.14301, -63.6686],
			[17.76222, -64.7239],
			[18.71726, -71.4281],
			[20.00987, -72.9105],
			[20.74931, -66.2032],
			[21.44073, -65.3662]
		],
		[
			[22.16646, 33.1782],
			[22.71671, 30.2212],
			[23.06291, 28.0828],
			[.13979, 29.0904],
			[.2206, 15.1836],
			[23.07935, 15.2053],
			[22.77822, 12.1729],
			[22.69103, 10.8314],
			[22.16999, 6.1979],
			[21.73643, 9.875]
		],
		[
			[23.07935, 15.2053],
			[23.06291, 28.0828],
			[22.83339, 24.6016],
			[22.77552, 23.5657],
			[22.11685, 25.3451],
			[21.74409, 25.645]
		],
		[
			[3.73865, 32.2882],
			[3.9022, 31.8836],
			[3.98275, 35.791],
			[3.96423, 40.0102],
			[3.75323, 42.5785],
			[3.71542, 47.7876],
			[3.60816, 48.1926],
			[3.40538, 49.8612],
			[3.07994, 53.5064],
			[2.84495, 55.8955],
			[2.90429, 52.7625],
			[3.15111, 49.6133],
			[3.15827, 44.8575],
			[3.13615, 40.9556],
			[3.18816, 39.6116],
			[3.08627, 38.8403],
			[2.97935, 39.6627],
			[2.99441, 41.0329],
			[3.13615, 40.9556]
		],
		[
			[4.10973, 50.3513],
			[4.24829, 48.4093],
			[4.14436, 47.7125],
			[3.71542, 47.7876]
		],
		[
			[3.15111, 49.6133],
			[2.73666, 49.2284],
			[1.72768, 50.6887]
		],
		[
			[.43807, -42.306],
			[1.1014, -46.7184],
			[1.47276, -43.3182],
			[1.52086, -49.0727],
			[1.13975, -55.2458],
			[1.1014, -46.7184],
			[.15685, -45.7474],
			[.43807, -42.306]
		],
		[
			[6.80318, -61.9414],
			[5.83046, -56.1667],
			[5.78808, -51.0665]
		],
		[
			[1.22915, 24.5837],
			[1.19435, 30.0896],
			[1.32444, 27.2641],
			[1.22915, 24.5837],
			[1.19089, 21.0347],
			[1.52473, 15.3458],
			[1.75657, 9.1577],
			[2.03412, 2.7638],
			[1.8926, 3.1875],
			[1.69053, 5.4876],
			[1.50309, 6.1438],
			[1.22886, 7.5754],
			[1.04906, 7.8901],
			[.81137, 7.5851],
			[23.98853, 6.8633],
			[23.66585, 5.6263],
			[23.46614, 6.379],
			[23.33905, 5.3813],
			[23.28609, 3.2823],
			[23.44887, 1.2556],
			[23.70078, 1.78],
			[23.7732, 3.4868],
			[23.66585, 5.6263]
		],
		[[23.28609, 3.2823], [23.06461, 3.82]],
		[
			[22.67759, -27.0436],
			[22.96085, -29.6222],
			[22.93247, -32.5396],
			[22.87543, -32.8755],
			[22.52509, -32.3461],
			[22.13973, -32.9885],
			[21.74911, -33.0258],
			[21.7956, -30.8983],
			[22.13973, -32.9885],
			[22.67759, -27.0436]
		],
		[
			[6.62935, -43.1959],
			[7.28571, -37.0975],
			[7.58969, -28.3693],
			[7.64719, -26.8038],
			[7.82157, -24.8598],
			[7.94765, -22.8801],
			[8.12573, -24.3043],
			[8.05973, -40.0031],
			[8.15887, -47.3366]
		],
		[
			[7.82157, -24.8598],
			[7.80143, -25.9372],
			[7.73013, -28.9548],
			[7.58969, -28.3693]
		],
		[
			[8.05973, -40.0031],
			[8.66837, -35.3084],
			[8.72654, -33.1864],
			[8.8422, -27.7098]
		],
		[
			[4.24041, -62.4739],
			[4.27473, -59.3022],
			[3.9791, -61.4002],
			[3.73666, -64.8069],
			[4.24041, -62.4739]
		],
		[
			[19.66827, 18.0139],
			[19.78979, 18.5343],
			[19.97929, 19.4921]
		],
		[[19.68415, 17.476], [19.78979, 18.5343]],
		[
			[18.29379, -36.7617],
			[18.40287, -34.3846],
			[18.3499, -29.8281],
			[18.46618, -25.4217],
			[18.22939, -21.0588]
		],
		[
			[19.37731, -44.459],
			[19.39811, -40.6159],
			[19.04353, -29.8801],
			[18.76094, -26.9908],
			[18.46618, -25.4217]
		],
		[
			[19.92103, -41.8683],
			[19.99561, -35.2763],
			[19.93065, -26.2995],
			[19.61179, -24.8836],
			[19.42125, -24.5086],
			[19.25901, -25.2567],
			[18.92109, -26.2967],
			[18.76094, -26.9908],
			[18.3499, -29.8281],
			[18.0968, -30.4241],
			[18.40287, -34.3846],
			[19.04353, -29.8801],
			[19.11567, -27.6704],
			[18.92109, -26.2967],
			[19.07805, -21.7415],
			[19.16273, -21.0236],
			[19.29391, -18.9529],
			[19.36121, -17.8472],
			[19.36212, -15.955]
		],
		[
			[19.07805, -21.7415],
			[18.96217, -21.1067],
			[18.90283, -22.7448],
			[18.92109, -26.2967]
		],
		[
			[15.98087, -26.1141],
			[16.00556, -22.6217],
			[16.09062, -19.8055]
		],
		[
			[16.00556, -22.6217],
			[16.35315, -25.5928],
			[16.49013, -26.432],
			[16.59804, -28.216],
			[16.83606, -34.2932],
			[16.86451, -38.0474],
			[16.90973, -42.3613],
			[17.20255, -43.2392],
			[17.62198, -42.9978],
			[17.79308, -40.127],
			[17.70813, -39.03],
			[17.56015, -37.1038]
		],
		[
			[.97677, -29.3574],
			[23.81543, -28.1303],
			[23.31373, -32.532],
			[23.54951, -37.8183]
		],
		[
			[18.58679, -8.2441],
			[18.78624, -4.7479],
			[18.70456, -9.0525],
			[18.48663, -14.5658],
			[18.58679, -8.2441]
		],
		[
			[15.76979, 15.4218],
			[15.69251, 19.6704],
			[15.81233, 18.1416],
			[15.94089, 15.6616],
			[15.76979, 15.4218],
			[15.58004, 10.5389],
			[15.7378, 6.4256],
			[15.84693, 4.4777],
			[16.23909, -3.6943]
		],
		[
			[17.17297, -15.7249],
			[17.62645, -15.3986],
			[17.98377, -9.7736],
			[18.05137, -8.1803],
			[18.35517, -2.8988],
			[18.93699, 4.2036]
		],
		[
			[10.1323, -.3716],
			[9.87512, -8.105],
			[10.49131, -2.7391],
			[10.50485, -.637]
		],
		[
			[5.62741, 21.1425],
			[4.59868, 16.5093],
			[4.47771, 15.8709],
			[4.32989, 15.6276],
			[4.38225, 17.5425],
			[4.47695, 19.1804],
			[5.4382, 28.6075]
		],
		[
			[4.32989, 15.6276],
			[4.01134, 12.4903],
			[3.45282, 9.7327],
			[4.05261, 5.9893]
		],
		[
			[3.45282, 9.7327],
			[3.41355, 9.0289],
			[3.61455, .4017]
		],
		[
			[18.18715, -45.9544],
			[18.44956, -45.9685],
			[18.48051, -49.0706]
		],
		[
			[1.88469, 29.5788],
			[2.15906, 34.9873],
			[2.28857, 33.8472],
			[1.88469, 29.5788]
		],
		[
			[16.81108, -69.0277],
			[15.91905, -63.4307],
			[15.31516, -68.6795],
			[16.81108, -69.0277]
		],
		[
			[22.30836, -60.2596],
			[23.29049, -58.2357],
			[.52574, -62.9582],
			[.33452, -64.8748],
			[23.99861, -65.5771],
			[22.45555, -64.9664],
			[22.30836, -60.2596]
		],
		[
			[12.2571, 57.0326],
			[11.06213, 61.751],
			[11.03069, 56.3824],
			[11.89718, 53.6948],
			[12.2571, 57.0326],
			[12.90049, 55.9598],
			[13.39876, 54.9254],
			[13.79235, 49.3133]
		],
		[
			[11.89718, 53.6948],
			[11.76751, 47.7794],
			[11.30798, 33.0943],
			[11.30312, 31.5308]
		],
		[
			[11.76751, 47.7794],
			[11.16106, 44.4985],
			[10.37215, 41.4995]
		],
		[[11.16106, 44.4985], [10.28494, 42.9144]],
		[
			[11.06213, 61.751],
			[9.52547, 63.0619],
			[8.50441, 60.7182],
			[9.84982, 59.0387],
			[11.03069, 56.3824]
		],
		[
			[11.03069, 56.3824],
			[9.86843, 54.0643],
			[9.54762, 51.6773],
			[8.98679, 48.0418]
		],
		[[9.06043, 47.1565], [9.54762, 51.6773]],
		[
			[15.73431, 77.7945],
			[16.29175, 75.7553],
			[15.34547, 71.834],
			[14.84509, 74.1555],
			[15.73431, 77.7945],
			[16.76618, 82.0373],
			[17.53695, 86.5865],
			[2.5303, 89.2641]
		],
		[
			[8.74506, -54.7088],
			[9.36856, -55.0107],
			[9.94771, -54.5678],
			[10.77949, -49.4203],
			[10.2456, -42.1219],
			[9.51167, -40.4668],
			[9.13327, -43.4326],
			[8.15887, -47.3366]
		],
		[
			[11.76432, 6.5294],
			[11.84492, 1.7647],
			[12.33177, -.6668],
			[12.69435, -1.4494],
			[13.16583, -5.539],
			[13.41988, -11.1613],
			[14.26691, -6.0005],
			[14.71767, -5.6582]
		],
		[
			[13.03628, 10.9592],
			[12.92673, 3.3975],
			[12.69435, -1.4494]
		],
		[
			[13.16583, -5.539],
			[13.57822, -.5958],
			[14.02744, 1.5445],
			[14.77081, 1.8929]
		],
		[
			[9.04077, -66.3961],
			[8.42894, -66.1369],
			[8.13217, -68.6171],
			[7.28051, -67.9572],
			[7.14579, -70.4989],
			[8.13217, -68.6171],
			[9.04077, -66.3961]
		],
		[
			[19.27029, 21.3904],
			[19.47843, 24.6649],
			[19.89103, 24.0796],
			[20.01835, 27.7536],
			[20.26281, 27.8142]
		]
	]
};
var NAKED_EYE_PLANETS = [
	{
		body: Body.Mercury,
		name: "Mercury"
	},
	{
		body: Body.Venus,
		name: "Venus"
	},
	{
		body: Body.Mars,
		name: "Mars"
	},
	{
		body: Body.Jupiter,
		name: "Jupiter"
	},
	{
		body: Body.Saturn,
		name: "Saturn"
	}
];
function phaseName(angleDeg) {
	const a = (angleDeg % 360 + 360) % 360;
	if (a < 22.5 || a >= 337.5) return "new moon";
	if (a < 67.5) return "waxing crescent";
	if (a < 112.5) return "first quarter";
	if (a < 157.5) return "waxing gibbous";
	if (a < 202.5) return "full moon";
	if (a < 247.5) return "waning gibbous";
	if (a < 292.5) return "last quarter";
	return "waning crescent";
}
/** Parts of an instant as wall-clock fields in a given IANA zone. */
function zonedParts(date, timeZone) {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23"
	});
	const bag = {};
	for (const p of fmt.formatToParts(date)) if (p.type !== "literal") bag[p.type] = p.value;
	return {
		year: Number(bag.year),
		month: Number(bag.month),
		day: Number(bag.day),
		hour: Number(bag.hour),
		minute: Number(bag.minute),
		second: Number(bag.second)
	};
}
/**
* Convert civil wall time in `timeZone` to a UTC Date.
* One-step offset correction; good enough for keepsake charts.
*/
function civilTimeToUtc(year, month, day, hour, minute, timeZone) {
	const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
	try {
		const parts = zonedParts(new Date(utcGuess), timeZone);
		const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
		return new Date(utcGuess - (asIfUtc - utcGuess));
	} catch {
		return new Date(utcGuess);
	}
}
/**
* Horizon → chart coords.
* Zenith at origin; horizon at r = 1.
* North at top, east at left (viewer on their back, head north).
* SVG y grows downward, so north uses negative y.
*/
function altAzToChart(alt, az) {
	if (alt < 0) return null;
	const r = (90 - alt) / 90;
	const rad = az * Math.PI / 180;
	return {
		x: round3(-r * Math.sin(rad)),
		y: round3(-r * Math.cos(rad))
	};
}
function round3(n) {
	return Math.round(n * 1e3) / 1e3;
}
function projectEquatorial(when, observer, raHours, decDeg) {
	const hor = Horizon(when, observer, raHours, decDeg, "normal");
	return altAzToChart(hor.altitude, hor.azimuth);
}
function formatTimeLabel(time, usedMidnight) {
	if (usedMidnight) return null;
	return time || null;
}
function computeStarMap(opts) {
	const [y, m, d] = opts.date.split("-").map(Number);
	const usedMidnight = !opts.time;
	let hour = 0;
	let minute = 0;
	if (opts.time) {
		const [hh, mm] = opts.time.split(":").map(Number);
		if (!Number.isNaN(hh)) hour = hh;
		if (!Number.isNaN(mm)) minute = mm;
	}
	const tz = opts.timeZone || "UTC";
	const when = civilTimeToUtc(y, m, d, hour, minute, tz);
	const observer = new Observer(opts.lat, opts.lon, 0);
	const stars = [];
	for (const [ra, dec, mag] of STAR_CATALOG.stars) {
		const pt = projectEquatorial(when, observer, ra, dec);
		if (!pt) continue;
		stars.push({
			x: pt.x,
			y: pt.y,
			mag
		});
	}
	const lines = [];
	for (const seg of STAR_CATALOG.lines) {
		const projected = seg.map(([ra, dec]) => projectEquatorial(when, observer, ra, dec));
		let run = [];
		const flush = () => {
			if (run.length >= 2) lines.push(run);
			run = [];
		};
		for (const p of projected) {
			if (!p) {
				flush();
				continue;
			}
			run.push([p.x, p.y]);
		}
		flush();
	}
	let moon = null;
	try {
		const eq = Equator(Body.Moon, when, observer, true, true);
		const pt = projectEquatorial(when, observer, eq.ra, eq.dec);
		if (pt) {
			const illum = Illumination(Body.Moon, when);
			moon = {
				x: pt.x,
				y: pt.y,
				phase: phaseName(MoonPhase(when)),
				illuminationPct: Math.round(illum.phase_fraction * 100)
			};
		}
	} catch {
		moon = null;
	}
	const planets = [];
	for (const { body, name } of NAKED_EYE_PLANETS) try {
		const eq = Equator(body, when, observer, true, true);
		const pt = projectEquatorial(when, observer, eq.ra, eq.dec);
		if (pt) planets.push({
			name,
			x: pt.x,
			y: pt.y
		});
	} catch {}
	return {
		stars,
		lines,
		moon,
		planets,
		whenIso: when.toISOString(),
		usedMidnight,
		timeLabel: formatTimeLabel(opts.time || void 0, usedMidnight),
		lat: opts.lat,
		lon: opts.lon,
		magLimit: STAR_CATALOG.magLimit,
		source: STAR_CATALOG.source
	};
}
// worker/story.ts
function ageOn(date, now = /* @__PURE__ */ new Date()) {
	const [y, m, d] = date.split("-").map(Number);
	let age = now.getFullYear() - y;
	if (!(now.getMonth() + 1 > m || now.getMonth() + 1 === m && now.getDate() >= d)) age -= 1;
	return Math.max(0, age);
}
async function fetchWeather(date, lat, lon) {
	const url = new URL("https://archive-api.open-meteo.com/v1/archive");
	url.searchParams.set("latitude", String(lat));
	url.searchParams.set("longitude", String(lon));
	url.searchParams.set("start_date", date);
	url.searchParams.set("end_date", date);
	url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max");
	url.searchParams.set("timezone", "auto");
	try {
		const res = await fetch(url.toString(), {
			headers: { Accept: "application/json" },
			cf: {
				cacheTtl: 86400,
				cacheEverything: true
			}
		});
		if (!res.ok) return null;
		const d = (await res.json()).daily;
		if (!d?.temperature_2m_max?.[0] && d?.temperature_2m_max?.[0] !== 0) return null;
		return {
			highC: d.temperature_2m_max?.[0] ?? null,
			lowC: d.temperature_2m_min?.[0] ?? null,
			precipMm: d.precipitation_sum?.[0] ?? null,
			windMaxKmh: d.windspeed_10m_max?.[0] ?? null,
			source: "Open-Meteo ERA5 historical archive"
		};
	} catch {
		return null;
	}
}
async function fetchItunesPreview(title, artist) {
	try {
		const term = encodeURIComponent(`${title} ${artist}`);
		const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=1`, { cf: {
			cacheTtl: 604800,
			cacheEverything: true
		} });
		if (!res.ok) return {
			previewUrl: null,
			artworkUrl: null
		};
		const hit = (await res.json()).results?.[0];
		return {
			previewUrl: hit?.previewUrl ?? null,
			artworkUrl: hit?.artworkUrl100?.replace("100x100", "300x300") ?? null
		};
	} catch {
		return {
			previewUrl: null,
			artworkUrl: null
		};
	}
}
async function fetchWikipediaOnThisDay(month, day) {
	const endpoints = [`https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${month}/${day}`, `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${month}/${day}`];
	for (const endpoint of endpoints) try {
		const res = await fetch(endpoint, { headers: {
			Accept: "application/json",
			"User-Agent": "Arriveday/0.1 (https://arriveday.workers.dev; birthday time capsule)",
			"Api-User-Agent": "Arriveday/0.1 (https://arriveday.workers.dev; birthday time capsule)"
		} });
		if (!res.ok) continue;
		const data = await res.json();
		const headlines = (data.events ?? []).slice(0, 8).map((e) => ({
			title: e.text,
			year: e.year,
			url: e.pages?.[0]?.content_urls?.desktop?.page || (e.pages?.[0]?.normalizedtitle ? `https://en.wikipedia.org/wiki/${encodeURIComponent(e.pages[0].normalizedtitle)}` : void 0)
		}));
		const twins = (data.births ?? []).slice(0, 12).map((b) => {
			return {
				name: b.pages?.[0]?.normalizedtitle || b.text.replace(/^\d+\s*[–—-]\s*/, "").split(",")[0]?.trim() || b.text,
				year: b.year,
				description: b.pages?.[0]?.description || b.text
			};
		});
		if (headlines.length || twins.length) return {
			headlines,
			twins
		};
	} catch {}
	return {
		headlines: [],
		twins: []
	};
}
function apodArchiveUrl(date) {
	const [y, m, d] = date.split("-");
	return `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${d}.html`;
}
async function fetchNasaApod(date) {
	if (date < "1995-06-16") return null;
	try {
		const url = `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=${date}`;
		const res = await fetch(url);
		if (res.ok) {
			const data = await res.json();
			if (!(!data.url || data.title === "NASA Science" || (data.url || "").includes("nasa-logo"))) return {
				title: data.title || "NASA Astronomy Picture of the Day",
				url: data.hdurl || data.url || "",
				explanation: data.explanation || "",
				copyright: data.copyright,
				pageUrl: apodArchiveUrl(date)
			};
		}
	} catch {}
	try {
		const pageUrl = apodArchiveUrl(date);
		const res = await fetch(pageUrl, { redirect: "follow" });
		if (!res.ok) return null;
		const html = await res.text();
		const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] || html.match(/content="([^"]+)"\s+property="og:image"/i)?.[1] || html.match(/https:\/\/assets\.science\.nasa\.gov\/content\/dam\/science\/cds\/apod\/[^"'\\]+\.jpe?g/i)?.[0] || "";
		const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] || html.match(/content="([^"]+)"\s+property="og:title"/i)?.[1] || "";
		const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/i)?.[1] || html.match(/name="description"\s+content="([^"]+)"/i)?.[1] || "";
		const title = ogTitle.replace(/^APOD:\s*\d{4}\s+\w+\s+\d+\s*-\s*/i, "").replace(/\s*-\s*NASA Science$/i, "").trim() || "NASA Astronomy Picture of the Day";
		let imgUrl = decodeHtmlEntities(ogImage).split("?")[0];
		imgUrl = imgUrl.replace(/(\.jpe?g)(\/.*)?$/i, "$1");
		return {
			title,
			url: imgUrl,
			explanation: decodeHtmlEntities(ogDesc).slice(0, 500) || `See NASA’s Astronomy Picture of the Day for ${date}.`,
			pageUrl: res.url || pageUrl
		};
	} catch {
		return {
			title: "NASA Astronomy Picture of the Day",
			url: "",
			explanation: `Open the archive page for ${date}.`,
			pageUrl: apodArchiveUrl(date)
		};
	}
}
function decodeHtmlEntities(s) {
	return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#039;/g, "'");
}
async function searchCities(query) {
	const q = query.trim();
	if (q.length < 2) return [];
	const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
	url.searchParams.set("name", q);
	url.searchParams.set("count", "6");
	url.searchParams.set("language", "en");
	url.searchParams.set("format", "json");
	try {
		const res = await fetch(url.toString(), { cf: {
			cacheTtl: 3600,
			cacheEverything: true
		} });
		if (!res.ok) return [];
		return ((await res.json()).results ?? []).map((r) => ({
			label: [
				r.name,
				r.admin1,
				r.country
			].filter(Boolean).join(", "),
			lat: r.latitude,
			lon: r.longitude,
			timeZone: r.timezone,
			country: r.country
		}));
	} catch {
		return [];
	}
}
async function resolveCity(cityParam) {
	const decoded = decodeURIComponent(cityParam);
	const hits = await searchCities(decoded.split(",")[0] || decoded);
	const exact = hits.find((h) => h.label.toLowerCase() === decoded.toLowerCase());
	if (exact) return exact;
	if (hits[0]) return hits[0];
	return {
		label: decoded,
		lat: 0,
		lon: 0,
		timeZone: "UTC"
	};
}
async function buildStory(opts) {
	const city = await resolveCity(opts.city);
	const [y, m, d] = opts.date.split("-").map(Number);
	const age = ageOn(opts.date);
	const song = lookupSong(opts.date);
	const [weather, itunes, wiki, nasa] = await Promise.all([
		city.lat || city.lon ? fetchWeather(opts.date, city.lat, city.lon) : Promise.resolve(null),
		song ? fetchItunesPreview(song.title, song.artist) : Promise.resolve({
			previewUrl: null,
			artworkUrl: null
		}),
		fetchWikipediaOnThisDay(m, d),
		fetchNasaApod(opts.date)
	]);
	const twins = [...wiki.twins].sort((a, b) => {
		return (a.year == null ? 999 : Math.abs(a.year - y)) - (b.year == null ? 999 : Math.abs(b.year - y));
	});
	const headlines = [...wiki.headlines].sort((a, b) => {
		return (a.year == null ? 999 : Math.abs(a.year - y)) - (b.year == null ? 999 : Math.abs(b.year - y));
	});
	return {
		name: opts.name?.trim() || null,
		date: opts.date,
		time: opts.time || null,
		city,
		ageYears: age,
		chapters: {
			sky: computeSky({
				date: opts.date,
				time: opts.time || void 0,
				lat: city.lat,
				lon: city.lon,
				timeZone: city.timeZone
			}),
			weather,
			song: song ? {
				...song,
				...itunes
			} : null,
			prices: lookupPrices(y),
			life: lifeNumbers(opts.date),
			births: lookupBirths(y),
			starmap: computeStarMap({
				date: opts.date,
				time: opts.time,
				lat: city.lat,
				lon: city.lon,
				timeZone: city.timeZone
			}),
			star: lookupStar(age),
			headlines,
			twins,
			market: lookupMarket(y),
			film: lookupFilm(y),
			leaders: lookupLeaders(y, city.country),
			culture: {
				...lookupCulture(y),
				...birthMeta(opts.date)
			},
			nasa
		},
		sources: [
			"Open-Meteo",
			"Astronomy Engine",
			"Yale Bright Star Catalogue (via d3-celestial)",
			"IAU constellation figures",
			"UN World Population Prospects 2024 (via Our World in Data)",
			"Box Office Mojo Domestic Yearly Box Office",
			"Wikidata / curated national leadership timelines",
			"Billboard Hot 100 (bundled chart dates)",
			"US price/CPI snapshots",
			"Wikipedia On This Day",
			"NASA APOD"
		]
	};
}
// worker/index.ts
var app = new Hono();
app.use("/api/*", cors());
app.get("/api/health", (c) => c.json({
	ok: true,
	app: "arriveday"
}));
app.get("/api/cities", async (c) => {
	const results = await searchCities(c.req.query("q") || "");
	return c.json({ results });
});
app.get("/api/story/:date/:city", async (c) => {
	const date = c.req.param("date");
	const city = c.req.param("city");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "Invalid date. Use YYYY-MM-DD." }, 400);
	const name = c.req.query("n") || null;
	const time = c.req.query("t") || null;
	try {
		const story = await buildStory({
			date,
			city,
			name,
			time
		});
		return c.json(story, 200, { "Cache-Control": "public, max-age=3600" });
	} catch (err) {
		console.error(err);
		return c.json({ error: "Failed to build story" }, 500);
	}
});
app.get("/api/og", async (c) => {
	const name = c.req.query("n") || "Someone";
	const date = c.req.query("d") || "";
	const city = c.req.query("c") || "";
	const title = `${name}`;
	const subtitle = [date, city].filter(Boolean).join(" · ");
	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1020"/>
      <stop offset="55%" stop-color="#151B2E"/>
      <stop offset="100%" stop-color="#1A2238"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="980" cy="120" r="180" fill="#E8B86D" fill-opacity="0.08"/>
  <circle cx="160" cy="520" r="220" fill="#5870B4" fill-opacity="0.16"/>
  <text x="80" y="120" fill="#E8B86D" font-family="Georgia, serif" font-size="36">Arriveday</text>
  <text x="80" y="280" fill="#F4EFE6" font-family="Georgia, serif" font-size="64">${escapeXml(title)}</text>
  <text x="80" y="360" fill="#9AA3B8" font-family="Helvetica, Arial, sans-serif" font-size="32">${escapeXml(subtitle)}</text>
  <text x="80" y="560" fill="#E8B86D" font-family="Helvetica, Arial, sans-serif" font-size="24">The world on the day you arrived</text>
</svg>`;
	return new Response(svg, { headers: {
		"Content-Type": "image/svg+xml; charset=utf-8",
		"Cache-Control": "public, max-age=86400"
	} });
});
function escapeXml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
app.all("*", async (c) => {
	if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
	return c.text("Arriveday API", 200);
});
// \0virtual:cloudflare/worker-entry
var worker_entry_default = app ?? {};
export { worker_entry_default as default };

//# sourceMappingURL=index.js.map