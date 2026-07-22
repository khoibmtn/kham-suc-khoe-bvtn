# Ứng dụng KSK NCT — image cho Render.com / HF Spaces / mọi host Docker.
# SQLite được sao lưu liên tục lên Cloudflare R2 bằng Litestream (xem DEPLOY.md).
FROM python:3.12-slim

WORKDIR /srv

# Litestream — sao lưu/khôi phục SQLite sang object storage (R2)
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/ls.tar.gz
RUN tar -xzf /tmp/ls.tar.gz -C /usr/local/bin litestream && rm /tmp/ls.tar.gz

COPY app/requirements.txt app/requirements.txt
RUN pip install --no-cache-dir -r app/requirements.txt

# Giữ nguyên cấu trúc repo: app/ import build/ qua đường dẫn tương đối,
# pipeline xuất .xlsm cần template trong doc/
COPY app app
COPY build build
COPY doc doc
COPY litestream.yml deploy/start.sh ./

RUN chmod +x start.sh && mkdir -p app/data

ENV PYTHONUNBUFFERED=1
CMD ["./start.sh"]
