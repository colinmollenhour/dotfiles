---
allowed-tools: WebFetch(domain:raw.githubusercontent.com)
description: Create a git commit
---

I want to build a `docker-compose.yml` file for this project that is compatible with Coolify. First read these docs:

https://raw.githubusercontent.com/coollabsio/coolify-docs/refs/heads/v4.x/docs/get-started/contribute/service.md
https://raw.githubusercontent.com/coollabsio/coolify-docs/refs/heads/v4.x/docs/knowledge-base/docker/compose.md

Here is an existing template that you should inspect and use as a reference:
https://raw.githubusercontent.com/coollabsio/coolify/ac1d98f6035caff10f36fa10508326b4791dec07/templates/compose/documenso.yaml

Research this project and create a file called `docker-compose.coolify.yml` according to those specs.
In particular:

- See if there are existing docker-compose.yml files to use as a reference, Dockerfiles, and other .md docs describing self-hosting.
- Look for all possible environment variables that should be considered for inclusion in the Coolify file. I want the Coolify file to support all important environment variables. If you are unsure, feel free to present a list of variables and ask before proceeding.
- When adding environment variables, add sane defaults where appropriate.
- Always use Coolify's special environment variables (SERVICE_*) to generate secret keys, passwords, etc. The user should not have to generate their own secrets, ever.
- There should already be a publicly hosted Docker image (Docker Hub, ghcr.io or other) available for this project mentioned in the README.md or elsewhere in the project, but if not, ask me where you can find it.

