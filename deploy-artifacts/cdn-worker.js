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
function computeSky(opts) {
	const [y, m, d] = opts.date.split("-").map(Number);
	let hour = 12;
	let minute = 0;
	if (opts.time) {
		const [hh, mm] = opts.time.split(":").map(Number);
		if (!Number.isNaN(hh)) hour = hh;
		if (!Number.isNaN(mm)) minute = mm;
	}
	const when = new Date(Date.UTC(y, m - 1, d, hour, minute));
	const observer = new Observer(opts.lat, opts.lon, 0);
	const phaseAngle = MoonPhase(when);
	const illum = Illumination(Body.Moon, when);
	let sunrise = null;
	let sunset = null;
	const noon = new Date(Date.UTC(y, m - 1, d, 12, 0));
	try {
		const rise = SearchRiseSet(Body.Sun, observer, 1, noon, 1);
		const set = SearchRiseSet(Body.Sun, observer, -1, noon, 1);
		const tz = opts.timeZone || "UTC";
		if (rise) sunrise = formatLocalClock(rise.date, tz);
		if (set) sunset = formatLocalClock(set.date, tz);
	} catch {}
	return {
		moonPhase: phaseName(phaseAngle),
		illuminationPct: Math.round(illum.phase_fraction * 100),
		sunrise,
		sunset
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
			star: lookupStar(age),
			headlines,
			twins,
			market: lookupMarket(y),
			culture: {
				...lookupCulture(y),
				...birthMeta(opts.date)
			},
			nasa
		},
		sources: [
			"Open-Meteo",
			"Astronomy Engine",
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

const __CDN_BASE__ = "https://cdn.jsdelivr.net/gh/mohammadusman666/bornhere@804fa24f3ba94c930cc9dc733678d2465871afa0/deploy-artifacts/client";
const __app__ = worker_entry_default;
function __ctype__(pathname) {
  if (pathname.endsWith('.html') || pathname === '/' || pathname === '') return 'text/html; charset=utf-8';
  if (pathname.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.json')) return 'application/json';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.ico')) return 'image/x-icon';
  if (pathname.endsWith('.woff2')) return 'font/woff2';
  return null;
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return __app__.fetch(request, env, ctx);
    }
    const assetPath = url.pathname === '/' || url.pathname === '' ? '/index.html' : url.pathname;
    try {
      const upstream = await fetch(__CDN_BASE__ + assetPath, {
        cf: { cacheEverything: true, cacheTtl: assetPath.startsWith('/assets/') ? 86400 : 60 },
      });
      if (upstream.ok) {
        const headers = new Headers(upstream.headers);
        const ct = __ctype__(assetPath);
        if (ct) headers.set('content-type', ct);
        headers.set(
          'cache-control',
          assetPath.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=60',
        );
        return new Response(upstream.body, { status: upstream.status, headers });
      }
    } catch (_) {}
    if (request.method === 'GET' || request.method === 'HEAD') {
      try {
        const index = await fetch(__CDN_BASE__ + '/index.html');
        if (index.ok) {
          return new Response(index.body, {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'public, max-age=60',
            },
          });
        }
      } catch (_) {}
    }
    return __app__.fetch(request, env, ctx);
  },
};

//# sourceMappingURL=index.js.map