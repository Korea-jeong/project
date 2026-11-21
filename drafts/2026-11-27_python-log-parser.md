title: Python 보안 스크립트 ②: SSH 로그 파서로 공격 IP 집계와 '실패 후 성공' 탐지
category: 프로그래밍언어/Python
tags: Python, 로그분석, 정규표현식, auth.log, 보안스크립트, 파이썬보안
schedule: 2026-11-27 19:00

리눅스 로그 분석 편에서 `grep | sort | uniq -c`로 공격 IP를 세어 봤습니다. 명령 한 줄로도 충분하지만, 매일 반복하거나 "실패가 몰린 뒤 같은 IP에서 로그인 성공" 같은 조건을 잡으려면 스크립트가 편합니다. 이번 글에서는 정규표현식으로 auth.log를 파싱해 보고서를 출력하는 Python 스크립트를 만듭니다.

## 1. 목표 정하기

스크립트가 할 일:

1. 로그 파일(일반 텍스트와 .gz 압축 모두)을 읽는다.
2. 실패/성공 로그에서 시각, 계정, IP를 뽑는다.
3. IP별 실패 횟수와 많이 시도된 계정을 집계한다.
4. **실패가 N번 이상 있었던 IP에서 성공한 로그인**을 경고한다.
5. 결과를 화면과 CSV로 출력한다.

## 2. 분석할 로그 형식

```
Nov 27 02:10:01 web01 sshd[1201]: Failed password for invalid user test from 198.51.100.7 port 40022 ssh2
Nov 27 02:10:03 web01 sshd[1201]: Failed password for root from 198.51.100.7 port 40030 ssh2
Nov 27 09:15:44 web01 sshd[2210]: Accepted publickey for alice from 192.0.2.10 port 52100 ssh2
```

전통적인 syslog 형식 기준입니다. 최근 일부 배포판은 `2026-11-27T02:10:01.123456+09:00` 같은 ISO 형식 시각을 쓰므로, 아래 코드는 두 형식을 모두 받도록 만듭니다.

## 3. 정규표현식 만들기

```python
import re

FAILED = re.compile(
    r"Failed password for (?:invalid user )?(?P<user>\S+) from (?P<ip>[\d.:a-fA-F]+)"
)
ACCEPTED = re.compile(
    r"Accepted (?P<method>\S+) for (?P<user>\S+) from (?P<ip>[\d.:a-fA-F]+)"
)
```

| 패턴 | 의미 |
|---|---|
| `(?:invalid user )?` | "invalid user "가 있어도 되고 없어도 됨(캡처 안 함) |
| `(?P<user>\S+)` | 공백 아닌 문자열을 user라는 이름으로 저장 |
| `[\d.:a-fA-F]+` | IPv4와 IPv6 주소 문자 |

> 정규표현식은 regex101.com 같은 사이트에서 예시 로그를 붙여 넣고 테스트하면 이해가 빠릅니다(실제 서버 로그는 IP 등 민감 정보를 지우고 넣으세요).

## 4. 로그 읽기(압축 파일 포함)

```python
import gzip

def open_log(path):
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="ignore")
    return open(path, encoding="utf-8", errors="ignore")
```

`errors="ignore"`는 깨진 문자가 섞인 줄 때문에 스크립트가 멈추지 않게 해 줍니다.

## 5. 집계 로직

```python
from collections import Counter, defaultdict

fail_by_ip = Counter()
fail_users = Counter()
success = []          # (줄 앞부분 시각, user, ip, method)

for path in paths:
    with open_log(path) as f:
        for line in f:
            if m := FAILED.search(line):
                fail_by_ip[m["ip"]] += 1
                fail_users[m["user"]] += 1
            elif m := ACCEPTED.search(line):
                stamp = line[:15] if line[:3].isalpha() else line[:19]
                success.append((stamp, m["user"], m["ip"], m["method"]))
```

`:=`(바다코끼리 연산자)는 Python 3.8부터 쓸 수 있습니다. `Counter`는 개수 세기 전용 딕셔너리라 `most_common()`으로 순위를 바로 뽑을 수 있습니다.

## 6. '실패 후 성공' 탐지

```python
THRESHOLD = 5
suspicious = [s for s in success if fail_by_ip[s[2]] >= THRESHOLD]
```

실패가 기준 이상 쌓인 IP에서 성공 기록이 있으면 비밀번호가 추측됐을 가능성이 있습니다. 단, 본인이 비밀번호를 몇 번 틀리고 접속한 경우도 걸리므로 경고 후 사람이 확인하는 용도로 쓰세요. 이 단순 버전은 실패와 성공의 시간 순서까지는 따지지 않습니다(연습 과제 참고).

## 7. 완성본

```python
#!/usr/bin/env python3
"""학습용 SSH 인증 로그 분석기 - 본인이 관리하는 서버 로그에만 사용"""
import argparse, csv, gzip, re
from collections import Counter

FAILED = re.compile(r"Failed password for (?:invalid user )?(?P<user>\S+) from (?P<ip>[\d.:a-fA-F]+)")
ACCEPTED = re.compile(r"Accepted (?P<method>\S+) for (?P<user>\S+) from (?P<ip>[\d.:a-fA-F]+)")

def open_log(path):
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="ignore")
    return open(path, encoding="utf-8", errors="ignore")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("logs", nargs="+", help="예: /var/log/auth.log /var/log/auth.log.2.gz")
    ap.add_argument("-n", "--top", type=int, default=10)
    ap.add_argument("--threshold", type=int, default=5)
    ap.add_argument("--csv", help="IP별 실패 횟수를 저장할 CSV 경로")
    args = ap.parse_args()

    fail_by_ip, fail_users, success = Counter(), Counter(), []
    for path in args.logs:
        with open_log(path) as f:
            for line in f:
                if m := FAILED.search(line):
                    fail_by_ip[m["ip"]] += 1
                    fail_users[m["user"]] += 1
                elif m := ACCEPTED.search(line):
                    stamp = line[:15] if line[:3].isalpha() else line[:19]
                    success.append((stamp, m["user"], m["ip"], m["method"]))

    print(f"== 실패 총 {sum(fail_by_ip.values())}건, 고유 IP {len(fail_by_ip)}개 ==")
    print(f"\n[실패 IP 상위 {args.top}]")
    for ip, n in fail_by_ip.most_common(args.top):
        print(f"  {n:>6}  {ip}")
    print(f"\n[시도된 계정 상위 {args.top}]")
    for user, n in fail_users.most_common(args.top):
        print(f"  {n:>6}  {user}")
    print(f"\n[로그인 성공 {len(success)}건]")
    for s in success[-args.top:]:
        print("  " + "  ".join(s))

    suspicious = [s for s in success if fail_by_ip[s[2]] >= args.threshold]
    if suspicious:
        print(f"\n[!] 실패 {args.threshold}회 이상 IP에서의 성공 로그인 - 즉시 확인 필요")
        for s in suspicious:
            print(f"  {s[0]}  user={s[1]}  ip={s[2]}  실패={fail_by_ip[s[2]]}")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["ip", "failed_count"])
            w.writerows(fail_by_ip.most_common())

if __name__ == "__main__":
    main()
```

실행 예시:

```
sudo python3 sshlog.py /var/log/auth.log /var/log/auth.log.1 --csv fails.csv
```

CSV는 `utf-8-sig`로 저장해 엑셀에서 열어도 한글이 깨지지 않습니다.

## 8. 연습 과제와 정리

| 단계 | 과제 |
|---|---|
| 초급 | `Connection closed ... [preauth]` 건수도 IP별로 세기 |
| 중급 | 시간대별(0~23시) 실패 건수 막대그래프를 텍스트로 출력 |
| 중급 | 실패 **이후에** 성공한 경우만 경고하도록 시간 순서 비교 추가 |
| 고급 | 결과를 매일 cron으로 실행하고 이전 날과 비교해 새 공격 IP만 알림 |

로그 형식은 배포판·sshd 버전·로깅 설정에 따라 다를 수 있습니다. 내 서버 로그 몇 줄을 먼저 확인하고 정규표현식을 맞춰 쓰세요. 공식 문서: docs.python.org의 re, collections, gzip 모듈.
