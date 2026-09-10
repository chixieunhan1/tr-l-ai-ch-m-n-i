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
  # Body di qua STDIN chu khong qua tham so dong lenh: curl.exe tren Windows doc
  # tham so theo ANSI codepage nen tieng Han truyen thang se thanh "???".
  curl -s "$URL" -H 'Content-Type: application/json' -d @- <<< "$1"
}

echo "=============================================================="
echo "[1] SC1 bài 5 · 존댓말  — gợi ý chỉ được dùng ngữ pháp tới bài 5"
echo "=============================================================="
call "{\"text\":\"$SENT\",\"mode\":\"deep\",\"context\":[],\"level\":\"sc1\",\"curriculum\":\"xirian\",\"lesson\":5,\"topic\":\"\",\"register\":\"jondaetmal\",\"dryRun\":true}" \
  | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
const sec=(h)=>{const i=d.system.indexOf(h); if(i<0) return ""; const j=d.system.indexOf("\n\n#",i); return j<0?d.system.slice(i):d.system.slice(i,j)};
const pool=sec("# Ngữ pháp");
console.log("model            :", d.model);
console.log("pattern trong pool:", d.poolPatterns, "· system", d.systemChars, "ký tự");
console.log("pool             :", pool.split("\n").filter(l=>/^B\d/.test(l)).join(" | "));
for (const g of ["V-았/었-","V-고"]) console.log((pool.includes(g)?"  CO  ":"  THIEU"), g);
// Tich luy nghiem ngat: cac pattern bai >=6 khong duoc xuat hien O BAT KY DAU
for (const g of ["(으)면서","V-아서/어서","못 V","ㅡ 탈락","V-고 싶다"])
  console.log((d.system.includes(g)?"  LO   ":"  sach "), g, "(bai >=6, khong duoc xuat hien)");
console.log("bai trong tam    :", (d.system.match(/# Bài trọng tâm.*/)||["(khong co)"])[0]);
console.log("muc Sap hoc      :", d.system.includes("# Sắp học")?"CON (sai)":"da bo (dung)");
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

echo
echo "=============================================================="
echo "[4] Cham CA DOAN · SC1 bài 5 — 3 câu, pool phải dừng ở bài 5"
echo "=============================================================="
call '{"mode":"passage","originals":["친구를 만났어요","밥을 먹었어요","영화를 봤어요"],"correcteds":["친구를 만났어요","밥을 먹었어요","영화를 봤어요"],"level":"sc1","curriculum":"xirian","lesson":5,"review":[],"topic":"","register":"jondaetmal","dryRun":true}' \
  | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
console.log("model            :", d.model);
console.log("pattern trong pool:", d.poolPatterns, "· system", d.systemChars, "ký tự");
console.log("so cau trong doan :", (d.user.match(/^\d+\. gốc: /gm)||[]).length);
for (const s of ["친구를 만났어요","밥을 먹었어요","영화를 봤어요"])
  console.log((d.user.includes(s)?"  CO  ":"  THIEU"), s);
const i=d.system.indexOf("# Ngữ pháp"), j=d.system.indexOf("\n\n#",i);
const pool=d.system.slice(i,j);
console.log("pool             :", pool.split("\n").filter(l=>/^B\d/.test(l)).join(" | "));
console.log("pool dung o B5   :", /\bB5 /.test(pool) && !/\bB6 /.test(pool) ? "dung" : "SAI");
console.log("bai trong tam    :", (d.system.match(/# Bài trọng tâm.*/)||["(khong co)"])[0]);
for (const f of ["rewritten","cohesion","consistency","recurring","upgrades","examples","note"])
  console.log((d.user.includes("\""+f+"\"")?"  CO  ":"  THIEU"), "truong", f);
'
