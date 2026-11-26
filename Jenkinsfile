// Deploys the production stack (docker-compose.yml) on the Docker agent.
//
// Jenkins credentials required (Manage Jenkins > Credentials, kind "Secret file"):
//   DIARY_ENV      .env with PUBLIC_URL, MAIL_FROM and the optional variables (see .env.example)
//   DIARY_SECRETS  tar.gz of the secrets directory, created from the server with:
//                  tar -czf diary-secrets.tgz -C secrets .
//
// Data is kept between deploys: PostgreSQL lives in the named volume "diary_pgdata" and the
// dumps in BACKUP_DIR (outside the workspace). Never add "down -v" to this pipeline.

pipeline {
    agent {
        label 'docker-agent'
    }

    parameters {
        booleanParam(name: 'NO_CACHE', defaultValue: false, description: 'Build the images without the Docker cache')
        string(name: 'ADMIN_EMAIL', defaultValue: '', description: 'Create this administrator after the deploy (leave empty to skip)')
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 40, unit: 'MINUTES')
    }

    environment {
        COMPOSE_FILE = 'docker-compose.yml'
        // Dumps live outside the workspace. Create it once on the agent, owned by the Jenkins user:
        //   sudo mkdir -p /var/backups/diary && sudo chown "$(id -u):$(id -g)" /var/backups/diary
        BACKUP_DIR = '/var/backups/diary'
        NGINX_HOST_PORT = '3004'
    }

    stages {
        stage('Verify workspace') {
            steps {
                // Stops early if the agent is running another project's compose file (stale workspace).
                sh '''
                    set -eu
                    echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
                    grep -q '^name: diary$' docker-compose.yml || {
                        echo "docker-compose.yml in $(pwd) is not the diary stack; cleanWs and checkout again" >&2
                        exit 1
                    }
                    if grep -q 'laravel-last' docker-compose.yml; then
                        echo "docker-compose.yml references laravel-last resources" >&2
                        exit 1
                    fi
                '''
            }
        }

        stage('Prepare environment') {
            steps {
                withCredentials([
                    file(credentialsId: 'DIARY_ENV', variable: 'DIARY_ENV_FILE'),
                    file(credentialsId: 'DIARY_SECRETS', variable: 'DIARY_SECRETS_TGZ')
                ]) {
                    sh '''
                        set -eu
                        cp "$DIARY_ENV_FILE" .env

                        # Extract to a scratch directory first: the archive may hold the files at its root
                        # or inside a subfolder, so each secret is located by name.
                        tmp="$(mktemp -d)"
                        trap 'rm -rf "$tmp"' EXIT
                        tar -xzf "$DIARY_SECRETS_TGZ" -C "$tmp"

                        rm -rf secrets && mkdir -p secrets
                        for name in postgres_owner_password diary_app_password diary_backup_password \
                                    database_owner_url database_app_url code_hmac_secret resend_api_key; do
                            found="$(find "$tmp" -type f -name "$name.txt" | head -n 1)"
                            if [ -z "$found" ] || [ ! -s "$found" ]; then
                                echo "DIARY_SECRETS does not contain a non-empty $name.txt" >&2
                                echo "archive entries:" >&2
                                tar -tzf "$DIARY_SECRETS_TGZ" >&2 || true
                                exit 1
                            fi
                            cp "$found" "secrets/$name.txt"
                        done
                        chmod 700 secrets
                        chmod 644 secrets/*.txt

                        mkdir -p "$BACKUP_DIR"
                    '''
                }
            }
        }

        stage('Down') {
            steps {
                // Stops and removes the containers only. Volumes (database, backups) are kept.
                sh 'docker compose -f $COMPOSE_FILE down'
            }
        }

        stage('Build') {
            steps {
                script {
                    def cache = params.NO_CACHE ? '--no-cache' : ''
                    sh "docker compose -f ${COMPOSE_FILE} build ${cache}"
                }
            }
        }

        stage('Deploy') {
            steps {
                // Migrations run in the "migrate" service before the app starts. --wait blocks until
                // every service is healthy (or fails after 5 minutes).
                sh '''
                    export BACKUP_UID="$(id -u)" BACKUP_GID="$(id -g)"
                    docker compose -f $COMPOSE_FILE up -d --wait --wait-timeout 300
                '''
            }
        }

        stage('Verify') {
            steps {
                sh '''
                    set -eu
                    # End-to-end check through nginx, from the agent itself.
                    for attempt in 1 2 3 4 5 6; do
                        if curl -fsS "http://127.0.0.1:${NGINX_HOST_PORT}/api/health"; then
                            echo
                            echo "deploy healthy"
                            exit 0
                        fi
                        sleep 5
                    done
                    echo "health check failed" >&2
                    docker compose -f $COMPOSE_FILE ps
                    docker compose -f $COMPOSE_FILE logs --tail=100
                    exit 1
                '''
            }
        }

        stage('Create administrator') {
            when {
                expression { return params.ADMIN_EMAIL?.trim() ? true : false }
            }
            steps {
                sh '''
                    export BACKUP_UID="$(id -u)" BACKUP_GID="$(id -g)"
                    docker compose -f $COMPOSE_FILE exec -T app \
                        node dist/server/cli/create-admin.js --email="$ADMIN_EMAIL"
                '''
            }
        }
    }

    post {
        failure {
            // Runs before the cleanup below: Compose still needs .env to show the status.
            sh 'docker compose -f $COMPOSE_FILE ps || true'
        }
        always {
            // Credentials are removed from the workspace; the running containers keep their mounts.
            sh 'rm -rf .env secrets'
        }
    }
}
