const AUTH_COOKIE_NAME = "haven_auth";

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function clearAuthCookie(res) {
  const { maxAge, ...options } = authCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, options);
}

function readAuthCookie(req) {
  const cookies = req.get("cookie");
  if (!cookies) return null;

  const prefix = `${AUTH_COOKIE_NAME}=`;
  const cookie = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!cookie) return null;

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch (error) {
    return null;
  }
}

module.exports = { AUTH_COOKIE_NAME, authCookieOptions, clearAuthCookie, readAuthCookie };
