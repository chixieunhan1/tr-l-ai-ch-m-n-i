#!/usr/bin/env bash
# Chay thu 3 cau hinh lop cho cung mot cau noi, xem prompt duoc dung ra sao.
# dryRun=true nen KHONG goi Anthropic, khong ton tien, khong can API key.
# Bo "dryRun" di la thanh loi goi that.
#
#   bash scripts/curl-3-configs.sh [port]

PORT="${1:-3117}"
URL="http://localhost:$PORT/api/analyze"
SENT='저는 어제 친구 만나요 그리고 밥 먹어요'

call() {
  curl -s "$URL" -H 'Content-Type: application/json' -d "$1"
}

echo "=============================================================="
echo "[1] SC1 bài 5 · 존댓말  — gợi ý chỉ được dùng ngữ pháp tới bài 5"
echo "=============================================================="
call "{\"text\":\"$SENT\",\"mode\":\"deep\",\"context\":[],\"level\":\"sc1\",\"curriculum\":\"xirian\",\"lesson\":5,\"topic\":\"\",\"register\":\"jondaetmal\",\"dryRun\":true}" \
  | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
const pool=d.system.slice(d.system.indexOf("# Ngữ pháp"), d.system.indexOf("# Sắp học"));
console.log("model            :", d.model);
console.log("pattern trong pool:", d.poolPatterns, "· system", d.systemChars, "ký tự");
console.log("pool             :", pool.split("\n").filter(l=>/^B\d/.test(l)).join(" | "));
for (const g of ["V-았/었-","V-고"]) console.log((pool.includes(g)?"  CO  ":"  THIEU"), g);
for (const g of ["(으)면서","V-아서/어서"]) console.log((d.system.includes(g)?"  LO   ":"  sach "), g, "(khong duoc xuat hien)");
console.log("sap hoc          :", d.system.slice(d.system.indexOf("# Sắp học")).split("\n").slice(1,3).join(" | "));
'

echo
echo "=============================================================="
echo "[2] TC1 bài 10 · Tự động — được dùng -고 나서, -(으)ㄴ 후에, -다가"
echo "=============================================================="
call "{\"text\":\"$SENT\",\"mode\":\"deep\",\"context\":[],\"level\":\"tc1\",\"curriculum\":\"xirian\",\"lesson\":10,\"topic\":\"\",\"register\":\"auto\",\"dryRun\":true}" \
  | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
console.log("pattern trong pool:", d.poolPatterns, "· system", d.systemChars, "ký tự");
for (const g of ["V-고 나서","V-(으)ㄴ 후에","V-다가"]) console.log((d.system.includes(g)?"  CO  ":"  THIEU"), g);
console.log("cac cap trong pool:", (d.system.match(/^## .+$/gm)||[]).join(" | "));
console.log("register         :", /Tự suy ra/.test(d.system) ? "Tu dong (khong ep 존댓말)" : "BI EP");
'

echo
echo "=============================================================="
echo "[3] Giáo trình Khác · TC2 — KHÔNG được nhắc tới số bài"
echo "=============================================================="
call "{\"text\":\"$SENT\",\"mode\":\"deep\",\"context\":[],\"level\":\"tc2\",\"curriculum\":\"other\",\"lesson\":null,\"topic\":\"\",\"register\":\"auto\",\"dryRun\":true}" \
  | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
console.log("pattern trong pool:", d.poolPatterns, "· system", d.systemChars, "ký tự");
const hits=(d.system.match(/bài \d+/gi)||[]).concat(d.system.match(/^B\d+ /gm)||[]);
console.log(hits.length ? "  LO   nhac so bai: "+hits.join(", ") : "  sach  khong nhac so bai nao");
console.log("co pool khong    :", d.system.includes("# Ngữ pháp học viên ĐÃ HỌC") ? "CO (sai)" : "khong (dung)");
console.log("dong dau         :", d.system.split("\n")[0]);
'
