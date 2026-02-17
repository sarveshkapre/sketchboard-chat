# Self-Hosted GitHub Actions Runner

This repository is configured to run CI on `runs-on: self-hosted` for all jobs.

## Runner Requirements

### Common requirements (all platforms)
- GitHub Actions runner service installed and registered to this repository.
- Network egress to `github.com`, `api.github.com`, and `objects.githubusercontent.com` (required by `actions/checkout`, `actions/setup-node`, CodeQL, and action downloads).
- Installed tools:
  - `bash`
  - `git`
  - `node` (Node 20; `actions/setup-node` installs/selects runtime per job)
  - `npm`
  - `curl`
  - `tar`
  - `unzip`
- Sufficient disk for checkout + `npm ci` + build artifacts.

### Linux packages (recommended baseline)
```bash
sudo apt-get update
sudo apt-get install -y bash git curl tar unzip ca-certificates
```

### macOS baseline
```bash
xcode-select --install
brew install git curl
```

### Optional tools
- `docker`: optional, useful only if you want to run workflow simulation locally with `act`.

## Register Runner (Repository Scope)

1. Open this repo in GitHub.
2. Go to `Settings -> Actions -> Runners`.
3. Click `New self-hosted runner`.
4. Select OS/architecture and copy the generated commands.
5. Run the generated commands on the target machine.

Example command sequence (replace values with commands shown by GitHub UI):
```bash
mkdir -p actions-runner && cd actions-runner
curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/download/<version>/actions-runner-<os>-<arch>-<version>.tar.gz
tar xzf actions-runner.tar.gz
./config.sh \
  --url https://github.com/<owner>/<repo> \
  --token <runner-registration-token> \
  --name <runner-name> \
  --labels self-hosted \
  --unattended \
  --replace
./run.sh
```

Run as a service (recommended):
- Linux:
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```
- macOS:
```bash
./svc.sh install
./svc.sh start
```

## CI Validation Commands (local runner host)

Run these on the same machine that hosts the self-hosted runner:
```bash
bash scripts/runner-preflight.sh
npm ci
npm run check
npm run smoke
npm audit --audit-level=high
```

If all commands pass, the runner host satisfies the workflow runtime requirements.
