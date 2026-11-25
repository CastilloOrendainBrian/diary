# Backup job: pg_dump in a loop, with retention. Uses the same PostgreSQL major as the database.
FROM postgres:16-alpine
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod 0755 /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
