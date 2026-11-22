title: tcpdump 기초: GUI 없는 서버에서 패킷 잡고 Wireshark로 분석하기
category: 보안 기술 노트
tags: tcpdump, 패킷캡처, BPF, 리눅스서버, 네트워크분석, 보안기술노트
schedule: 2026-11-30 19:00

Wireshark는 편리하지만 화면이 없는 리눅스 서버에서는 쓸 수 없습니다. 이럴 때 쓰는 도구가 **tcpdump**입니다. 서버에서 tcpdump로 패킷을 파일에 저장하고, 그 파일을 내 PC의 Wireshark로 열어 분석하는 방식이 실무에서 아주 흔합니다. 이 글에서는 필수 옵션, 필터 문법, 실전 예시를 정리합니다.

!> 캡처는 본인이 관리하는 서버나 허가받은 환경에서만 하세요. 캡처 파일에는 계정 정보·쿠키 같은 민감한 데이터가 들어갈 수 있으니 보관과 전달에 주의하세요.

## 1. 설치와 권한

```
sudo apt install tcpdump        # Ubuntu/Debian
sudo dnf install tcpdump        # RHEL/Rocky
tcpdump --version
```

패킷 캡처에는 관리자 권한이 필요하므로 보통 `sudo`와 함께 실행합니다.

## 2. 인터페이스 확인

```
sudo tcpdump -D        # 캡처 가능한 인터페이스 목록
ip addr                # 인터페이스 이름과 IP 확인(eth0, ens3, enp0s3 등)
```

`-i any`를 쓰면 모든 인터페이스를 한꺼번에 볼 수 있지만, 출력 형식이 조금 달라지니 분석할 때는 특정 인터페이스를 지정하는 편이 좋습니다.

## 3. 꼭 알아야 할 옵션

| 옵션 | 의미 |
|---|---|
| `-i eth0` | 캡처할 인터페이스 |
| `-n` | IP를 도메인으로 바꾸지 않음(빠르고, DNS 조회 잡음 방지) |
| `-nn` | 포트 번호도 서비스 이름으로 바꾸지 않음 |
| `-c 100` | 100개만 잡고 종료 |
| `-w file.pcap` | 파일로 저장(Wireshark로 열기 가능) |
| `-r file.pcap` | 저장한 파일 읽기 |
| `-A` | 내용을 ASCII로 출력(평문 확인) |
| `-X` | 16진수와 ASCII 함께 출력 |
| `-s 0` | 패킷 전체 길이 캡처(최근 버전은 기본값) |
| `-v`, `-vv` | 더 자세한 헤더 정보 |

## 4. BPF 필터 문법

tcpdump 필터는 지난 Wireshark 글의 "캡처 필터"와 같은 BPF 문법입니다.

```
host 192.168.0.10                  # 해당 IP 출발 또는 목적
src host 10.0.0.5                  # 출발지만
dst port 443                       # 목적지 포트
port 22 or port 80                 # 둘 중 하나
net 192.168.0.0/24                 # 대역
tcp and not port 22                # TCP 중 SSH 제외(원격 접속 중 필수)
udp port 53                        # DNS
'tcp[tcpflags] & tcp-syn != 0'     # SYN 플래그 포함 패킷
icmp                               # ping 등
```

> SSH로 접속한 서버에서 필터 없이 캡처하면, 캡처 출력이 SSH로 전송되고 그것이 다시 캡처되는 악순환으로 화면이 넘쳐납니다. 원격에서는 **`not port 22`**를 습관처럼 붙이세요.

## 5. 실전 예시

### 5-1. 웹서버로 들어오는 요청 확인
```
sudo tcpdump -i eth0 -nn -A 'tcp port 80 and not port 22' -c 50
```
HTTP는 평문이라 `GET /login` 같은 요청 줄이 그대로 보입니다. HTTPS(443)는 암호화되어 내용이 보이지 않습니다.

### 5-2. 이 서버는 어떤 도메인을 조회하나
```
sudo tcpdump -i eth0 -nn udp port 53
```
서버가 모르는 도메인을 반복 조회한다면 악성코드 통신(C2)을 의심해 볼 수 있습니다.

### 5-3. 포트 스캔 흔적
```
sudo tcpdump -i eth0 -nn 'tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn'
```
연결 요청(SYN)만 골라 봅니다. 한 IP가 짧은 시간에 여러 포트로 SYN을 보내면 스캔일 가능성이 높습니다. 11/23 nmap 글의 스캔을 테스트 서버에 해 보고 이 명령으로 관찰해 보세요.

### 5-4. 파일로 저장해 PC에서 분석
```
sudo tcpdump -i eth0 -nn -w /tmp/web_$(date +%F_%H%M).pcap 'not port 22'
# Ctrl+C로 중지 후 PC로 복사
scp user@server:/tmp/web_*.pcap .
```
받은 파일을 Wireshark로 열면 디스플레이 필터와 Follow Stream을 그대로 쓸 수 있습니다.

## 6. 오래 캡처할 때: 파일 회전

```
# 100MB마다 새 파일, 최대 10개 유지
sudo tcpdump -i eth0 -nn -w /var/tmp/cap.pcap -C 100 -W 10 'not port 22'

# 1시간(3600초)마다 새 파일
sudo tcpdump -i eth0 -nn -w '/var/tmp/cap_%Y%m%d_%H.pcap' -G 3600 'not port 22'
```

디스크가 가득 차면 서버 장애로 이어지므로, 장시간 캡처는 반드시 회전 옵션과 필터를 함께 쓰고 남은 용량(`df -h`)을 확인하세요.

## 7. 출력 한 줄 읽기

```
10:15:02.123456 IP 203.0.113.50.51234 > 192.168.0.23.22: Flags [S], seq 1000, win 64240, length 0
```

| 부분 | 의미 |
|---|---|
| 10:15:02.123456 | 시각 |
| 203.0.113.50.51234 | 출발지 IP.포트 |
| 192.168.0.23.22 | 목적지 IP.포트 |
| Flags [S] | SYN(연결 요청). `[S.]`=SYN/ACK, `[.]`=ACK, `[P.]`=데이터, `[F.]`=종료, `[R]`=거부 |
| length 0 | 데이터 길이 |

정보보안기사 실기에서 tcpdump 출력을 보고 3-way handshake나 스캔 유형을 해석하는 문제가 나올 수 있으니 플래그 표기를 꼭 익혀 두세요.

## 8. 정리

| 상황 | 명령 |
|---|---|
| 인터페이스 확인 | `tcpdump -D` |
| 간단히 보기 | `sudo tcpdump -i eth0 -nn -c 20 'not port 22'` |
| 평문 확인 | `-A` 추가 |
| 파일 저장 | `-w file.pcap` |
| 장시간 저장 | `-C 100 -W 10` 또는 `-G 3600` |
| 분석 | PC로 복사 후 Wireshark |

옵션 동작은 tcpdump/libpcap 버전에 따라 조금 다를 수 있으니 `man tcpdump`와 `man pcap-filter`를 함께 확인하세요. 다음 글에서는 오늘 관찰한 트래픽을 직접 막아 보는 **리눅스 방화벽(ufw·iptables) 기초**를 다룹니다.
