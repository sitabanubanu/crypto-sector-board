import { spawnSync } from "node:child_process";

const ALLOWED_HIGH_PACKAGES = new Set([
  "@eslint/config-array",
  "@eslint/eslintrc",
  "brace-expansion",
  "eslint",
  "eslint-config-next",
  "eslint-plugin-import",
  "eslint-plugin-jsx-a11y",
  "eslint-plugin-react",
  "minimatch",
]);

const ALLOWED_ADVISORIES = new Set([
  "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
]);

function runAudit() {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const args = npmCli ? [npmCli, "audit", "--json"] : ["audit", "--json"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: !npmCli && process.platform === "win32",
  });

  if (result.error) throw result.error;
  if (!result.stdout.trim()) {
    throw new Error(result.stderr.trim() || "npm audit returned no JSON");
  }
  return JSON.parse(result.stdout);
}

function collectAdvisories(vulnerabilities, name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);

  const advisories = new Set();
  const vulnerability = vulnerabilities[name];
  for (const via of vulnerability?.via ?? []) {
    if (typeof via === "string") {
      for (const advisory of collectAdvisories(vulnerabilities, via, seen)) {
        advisories.add(advisory);
      }
    } else if (via?.url) {
      advisories.add(via.url);
    } else if (via?.source) {
      advisories.add(`source:${via.source}`);
    }
  }
  return advisories;
}

try {
  const report = runAudit();
  const vulnerabilities = report.vulnerabilities ?? {};
  const highOrCritical = Object.entries(vulnerabilities).filter(
    ([, vulnerability]) =>
      vulnerability.severity === "high" ||
      vulnerability.severity === "critical",
  );
  const unexpectedPackages = highOrCritical
    .map(([name]) => name)
    .filter((name) => !ALLOWED_HIGH_PACKAGES.has(name));
  const observedAdvisories = new Set();
  for (const [name] of highOrCritical) {
    for (const advisory of collectAdvisories(vulnerabilities, name)) {
      observedAdvisories.add(advisory);
    }
  }
  const unexpectedAdvisories = [...observedAdvisories].filter(
    (advisory) => !ALLOWED_ADVISORIES.has(advisory),
  );

  if (unexpectedPackages.length > 0 || unexpectedAdvisories.length > 0) {
    console.error("Unexpected high/critical npm audit findings.");
    if (unexpectedPackages.length > 0) {
      console.error(`Packages: ${unexpectedPackages.join(", ")}`);
    }
    if (unexpectedAdvisories.length > 0) {
      console.error(`Advisories: ${unexpectedAdvisories.join(", ")}`);
    }
    process.exit(1);
  }

  if (highOrCritical.length > 0) {
    console.warn(
      `Allowed documented dev-only audit exception: ${highOrCritical.length} package findings, ${[...observedAdvisories].join(", ")}`,
    );
  } else {
    console.log("No high/critical npm audit findings.");
  }
} catch (error) {
  console.error(
    "Unable to evaluate npm audit policy:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
