/* Read-only server adapters. Destinations and credentials are server configuration only. */
export async function onRequestGet({ request, env, params }) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  let config;
  try {
    config = JSON.parse(env.PULSE_ADAPTERS_JSON || "{}")[params.name];
  } catch {
    return reply({ error: "Adapter configuration is invalid" }, 503);
  }
  if (!config)
    return reply(
      { error: "This facility adapter has not been configured" },
      503,
    );
  let url;
  try {
    url = new URL(config.url);
  } catch {
    return reply({ error: "Adapter URL is invalid" }, 503);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !["normalized", "nmos-discovery"].includes(config.kind)
  )
    return reply(
      { error: "Adapter requires HTTPS and a supported format" },
      503,
    );
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(config.token ? { Authorization: "Bearer " + config.token } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok)
      return reply({ error: "Facility source is unavailable" }, 502);
    const text = await response.text();
    if (new TextEncoder().encode(text).length > 1000000)
      return reply({ error: "Facility report is too large" }, 502);
    const body = JSON.parse(text),
      mapping = config.mapping || {},
      now = Date.now();
    let observations = [];
    if (config.kind === "normalized") {
      if (!Array.isArray(body.observations) || body.observations.length > 500)
        return reply({ error: "Invalid facility observation format" }, 502);
      observations = body.observations.map((o) => ({
        resource: mapping[o.resource],
        metric: String(o.metric || "").slice(0, 160),
        result: o.result,
        at: o.at,
      }));
      if (
        observations.some(
          (o) =>
            !o.resource ||
            !o.metric ||
            !["pass", "fail", "unknown"].includes(o.result) ||
            !Number.isFinite(o.at) ||
            o.at > now,
        )
      )
        return reply(
          { error: "Facility report has unmapped or invalid observations" },
          502,
        );
    } else {
      const nodes = Array.isArray(body) ? body : [body];
      observations = nodes
        .filter((n) => mapping[n.id])
        .slice(0, 500)
        .map((n) => ({
          resource: mapping[n.id],
          metric: "NMOS discovery entry observed; signal health untested",
          result: "unknown",
          at: now,
        }));
    }
    return reply({
      adapter: params.name,
      kind: config.kind,
      observations,
      receivedAt: now,
    });
  } catch {
    return reply({ error: "Facility adapter could not be read" }, 502);
  }
}
