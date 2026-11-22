// Teste do fluxo OAuth do MCP contra um deploy (épico 8.10; seção 6.5). O login com Google não é
// automatizável: o script confere tudo até ele e o que não depende dele.
// Uso: SITE_URL=https://fechouporquanto.com.br node scripts/test-oauth.mjs
const SITE = (process.env.SITE_URL ?? "http://localhost:3010").replace(/\/+$/, "");
const bypass = process.env.VERCEL_PROTECTION_BYPASS ? { "x-vercel-protection-bypass": process.env.VERCEL_PROTECTION_BYPASS } : {};
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok " : "!! "} ${msg}`); if (!cond) falhas++; };
const get = (p, init = {}) => fetch(`${SITE}${p}`, { redirect: "manual", ...init, headers: { ...bypass, ...(init.headers ?? {}) } });

const r401 = await get("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const www = r401.headers.get("www-authenticate") ?? "";
ok(r401.status === 401 && www.includes(`resource_metadata="${SITE}/.well-known/oauth-protected-resource"`), `/mcp sem credencial → 401 com resource_metadata (${r401.status})`);

const rec = await (await get("/.well-known/oauth-protected-resource/mcp")).json();
ok(rec.resource === `${SITE}/mcp` && rec.authorization_servers?.[0] === SITE, "metadados do recurso (RFC 9728)");
const as = await (await get("/.well-known/oauth-authorization-server")).json();
ok(as.issuer === SITE && as.code_challenge_methods_supported?.join() === "S256" && as.registration_endpoint === `${SITE}/oauth/registrar`, "metadados do servidor (RFC 8414)");

const ruim = await get("/oauth/registrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://exemplo.com/cb"] }) });
ok(ruim.status === 400, `registro com redirect http externo → 400 (${ruim.status})`);
const reg = await get("/oauth/registrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://localhost:6274/cb"], client_name: "test-oauth.mjs" }) });
const cliente = await reg.json();
ok(reg.status === 201 && cliente.client_id, `registro de cliente → 201 (${reg.status})`);

const q = new URLSearchParams({ response_type: "code", client_id: cliente.client_id, redirect_uri: "http://localhost:6274/cb", code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256", state: "s" });
const aut = await get(`/oauth/autorizar?${q}`);
ok([302, 303, 307].includes(aut.status) && (aut.headers.get("location") ?? "").includes("/oauth/entrar"), `consentimento sem sessão → Entrar com Google (${aut.status})`);
const inval = await get(`/oauth/autorizar?${new URLSearchParams({ ...Object.fromEntries(q), redirect_uri: "https://malicioso.test/cb" })}`);
ok(inval.status === 200 && !inval.headers.get("location"), "pedido com redirect_uri trocado → tela de erro, sem redirecionar");

const tok = await get("/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: "inexistente", client_id: cliente.client_id, redirect_uri: "http://localhost:6274/cb", code_verifier: "v".repeat(43) }) });
ok(tok.status === 400 && (await tok.json()).error === "invalid_grant", "código inexistente → invalid_grant");
const lixo = await get("/mcp", { method: "POST", headers: { authorization: "Bearer fpq_mcp_inexistente", "content-type": "application/json" }, body: "{}" });
ok(lixo.status === 401, "token OAuth inexistente → 401");

for (const p of ["/", "/conectar", "/privacidade", "/termos", "/oauth/entrar", "/robots.txt", "/sitemap.xml"]) ok((await get(p)).status === 200, `${p} público`);
console.log(falhas ? `${falhas} falha(s).` : "Tudo certo.");
process.exit(falhas ? 1 : 0);
