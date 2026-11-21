title: Python 보안 스크립트 ①: socket으로 만드는 간단한 포트 스캐너
category: 프로그래밍언어/Python
tags: Python, 포트스캐너, socket, 보안스크립트, 네트워크프로그래밍, 파이썬보안
schedule: 2026-11-24 19:00

어제 nmap으로 열린 포트를 확인해 봤다면, 오늘은 그 원리를 직접 코드로 구현해 봅니다. Python 표준 라이브러리만으로 50줄 남짓의 TCP 포트 스캐너를 만들고, 멀티스레드로 속도를 높이고, 결과를 저장하는 데까지 단계별로 진행합니다.

!> 이 스크립트는 학습용입니다. 본인 PC(`127.0.0.1`), 본인 공유기·NAS, 또는 허가받은 실습 환경에서만 실행하세요.

## 1. 원리: 연결이 되면 열린 포트

TCP 포트 스캐너의 핵심은 단순합니다. 대상 IP의 특정 포트로 접속(connect)을 시도해서

- 연결 성공 → **open**
- 연결 거부(RST) → **closed**
- 시간 초과(응답 없음) → **filtered**(방화벽 등)

로 판단합니다. nmap의 `-sT`(TCP Connect 스캔)와 같은 방식입니다.

## 2. 준비물

- Python 3.8 이상(설치 확인: `python3 --version`, Windows는 `python --version`)
- 외부 라이브러리 불필요: `socket`, `concurrent.futures`, `argparse`, `datetime`만 사용

## 3. 가장 단순한 버전: 포트 하나 확인

```python
import socket

def check_port(host, port, timeout=1.0):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        result = s.connect_ex((host, port))   # 0이면 연결 성공
        return result == 0

print(check_port("127.0.0.1", 22))
```

`connect()`는 실패하면 예외를 던지지만 `connect_ex()`는 오류 코드를 숫자로 돌려줘서 반복문에서 쓰기 편합니다. `with` 문을 쓰면 소켓이 자동으로 닫힙니다.

## 4. 여러 포트를 순서대로 스캔

```python
for port in range(1, 1025):
    if check_port("127.0.0.1", port, timeout=0.3):
        print(f"[OPEN] {port}")
```

동작은 하지만 느립니다. 닫힌 포트는 바로 응답이 오지만, 방화벽에 막힌 포트는 타임아웃까지 기다리기 때문입니다. 1,024개 포트 × 0.3초면 최악의 경우 5분이 넘습니다.

## 5. 멀티스레드로 빠르게

네트워크 대기 시간이 대부분이라 스레드를 여러 개 쓰면 크게 빨라집니다.

```python
from concurrent.futures import ThreadPoolExecutor

def scan(host, ports, workers=100, timeout=0.5):
    open_ports = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = ex.map(lambda p: (p, check_port(host, p, timeout)), ports)
        for port, is_open in results:
            if is_open:
                open_ports.append(port)
    return sorted(open_ports)
```

> 스레드 수를 너무 크게 잡으면 내 PC나 공유기에 부담이 가고, 상대 장비의 보안 장비가 공격으로 판단할 수 있습니다. 학습용으로는 50~200 정도로 충분합니다.

## 6. 서비스 이름과 배너 확인

```python
def service_name(port):
    try:
        return socket.getservbyport(port, "tcp")
    except OSError:
        return "unknown"

def grab_banner(host, port, timeout=1.0):
    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            s.settimeout(timeout)
            return s.recv(100).decode(errors="ignore").strip()
    except OSError:
        return ""
```

SSH처럼 접속하자마자 자기소개 문자열(배너)을 보내는 서비스는 버전 정보가 보입니다. 이 정보가 바로 공격자가 취약 버전을 찾는 단서라서, 실무에서는 배너에 상세 버전을 숨기도록 설정하기도 합니다.

## 7. 완성본: 명령줄 옵션과 결과 저장

```python
#!/usr/bin/env python3
"""학습용 TCP 포트 스캐너 - 본인/허가 대상에만 사용"""
import argparse, socket, datetime
from concurrent.futures import ThreadPoolExecutor

def check_port(host, port, timeout):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return port if s.connect_ex((host, port)) == 0 else None

def service_name(port):
    try:
        return socket.getservbyport(port, "tcp")
    except OSError:
        return "unknown"

def parse_ports(spec):
    ports = set()
    for part in spec.split(","):
        if "-" in part:
            a, b = map(int, part.split("-"))
            ports.update(range(a, b + 1))
        else:
            ports.add(int(part))
    return sorted(p for p in ports if 1 <= p <= 65535)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("host")
    ap.add_argument("-p", "--ports", default="1-1024")
    ap.add_argument("-t", "--threads", type=int, default=100)
    ap.add_argument("--timeout", type=float, default=0.5)
    ap.add_argument("-o", "--output")
    args = ap.parse_args()

    ip = socket.gethostbyname(args.host)
    ports = parse_ports(args.ports)
    start = datetime.datetime.now()
    print(f"[*] {args.host} ({ip}) 포트 {len(ports)}개 스캔 시작: {start:%Y-%m-%d %H:%M:%S}")

    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        found = [p for p in ex.map(lambda p: check_port(ip, p, args.timeout), ports) if p]

    lines = [f"{p}/tcp\topen\t{service_name(p)}" for p in found]
    print("\n".join(lines) if lines else "[*] 열린 포트 없음")
    print(f"[*] 완료: {(datetime.datetime.now() - start).total_seconds():.1f}초")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

if __name__ == "__main__":
    main()
```

실행 예시:

```
python3 portscan.py 127.0.0.1 -p 1-1024
python3 portscan.py 192.168.0.1 -p 22,80,443,8080 -o router.txt
```

## 8. 한계와 다음 단계

| 항목 | 이 스캐너 | nmap |
|---|---|---|
| 스캔 방식 | TCP Connect만 | SYN, UDP, 여러 방식 |
| 서비스 판별 | 포트 번호 기반 추정 | 응답 분석으로 버전 추정 |
| 속도 조절 | 스레드 수만 | 세밀한 타이밍 옵션 |
| 학습 가치 | 원리 이해에 좋음 | 실무 점검에 적합 |

연습 과제로 ① 결과를 CSV로 저장하기, ② 이전 결과와 비교해 새로 열린 포트만 알려 주기, ③ 배너 출력 옵션(`--banner`) 추가하기를 해 보세요. ②번은 "내 서버에 모르는 포트가 새로 열렸다"를 잡아내는 간단한 모니터링 도구가 됩니다.

※ Python 버전에 따라 일부 동작이 다를 수 있으니 공식 문서(docs.python.org의 socket, concurrent.futures)를 함께 확인하세요.
