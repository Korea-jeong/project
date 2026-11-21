title: 리눅스 로그 분석 기초: auth.log와 journalctl로 SSH 무차별 대입 흔적 찾기
category: 보안 기술 노트
tags: 리눅스로그, auth.log, journalctl, SSH보안, 무차별대입, 침해사고분석, 보안기술노트
schedule: 2026-11-25 19:00

인터넷에 SSH(22번 포트)를 열어 둔 서버를 운영해 보면, 내가 모르는 IP에서 수많은 로그인 시도가 들어오는 것을 금방 보게 됩니다. 이 글에서는 리눅스 인증 로그를 어디서 보는지, 어떤 줄이 공격 흔적인지, 명령 몇 줄로 공격 IP를 집계하는 방법과 대응까지 정리합니다.

## 1. 인증 로그는 어디에 있나

배포판마다 위치가 다릅니다.

| 배포판 | 파일 | 비고 |
|---|---|---|
| Ubuntu/Debian | `/var/log/auth.log` | 순환된 파일: auth.log.1, auth.log.2.gz |
| RHEL/CentOS/Rocky | `/var/log/secure` | |
| systemd 기반 공통 | `journalctl` | 파일 없이 저널에만 남는 배포판도 있음 |

로그는 관리자 권한으로만 읽을 수 있습니다(`sudo` 필요). 최근 일부 배포판은 rsyslog가 기본 설치되지 않아 auth.log 파일이 없고 journalctl로만 볼 수 있으니, 내 서버의 설정을 먼저 확인하세요.

## 2. 로그 한 줄 읽는 법

```
Nov 25 03:12:45 web01 sshd[2381]: Failed password for invalid user admin from 203.0.113.50 port 51234 ssh2
```

| 부분 | 의미 |
|---|---|
| Nov 25 03:12:45 | 발생 시각(서버 시간대 기준) |
| web01 | 호스트 이름 |
| sshd[2381] | 프로그램과 프로세스 번호 |
| Failed password | 비밀번호 인증 실패 |
| invalid user admin | 서버에 없는 계정 이름으로 시도 |
| from 203.0.113.50 | 접속을 시도한 IP |

## 3. 꼭 알아야 할 메시지 유형

| 메시지 | 의미 | 위험도 |
|---|---|---|
| `Failed password for invalid user` | 없는 계정으로 추측 시도 | 흔한 자동화 공격 |
| `Failed password for root` | root 비밀번호 추측 | root 로그인 허용 여부 점검 |
| `Accepted password for` / `Accepted publickey for` | **로그인 성공** | 내가 한 것인지 반드시 확인 |
| `Connection closed by ... [preauth]` | 인증 전에 끊김 | 스캐너·봇일 가능성 |
| `sudo: ... COMMAND=` | sudo로 실행한 명령 | 권한 상승 기록 |

> 실패 로그가 많은 것보다 더 중요한 것은 **실패가 몰아친 뒤 같은 IP에서 성공(Accepted)이 나온 경우**입니다. 이 패턴이 보이면 침해를 의심하고 즉시 조사해야 합니다.

## 4. grep으로 공격 흔적 찾기

```
# 실패 시도만 보기
sudo grep "Failed password" /var/log/auth.log | tail -20

# 로그인 성공 기록
sudo grep "Accepted" /var/log/auth.log

# 압축된 이전 로그까지 함께 검색
sudo zgrep "Failed password" /var/log/auth.log*
```

## 5. 공격 IP 순위 집계하기

리눅스 기본 명령을 파이프(`|`)로 이어 붙이면 간단한 통계를 낼 수 있습니다.

```
sudo grep "Failed password" /var/log/auth.log \
  | grep -oE "from [0-9.]+" \
  | awk '{print $2}' \
  | sort | uniq -c | sort -rn | head -10
```

| 명령 | 역할 |
|---|---|
| `grep -oE "from [0-9.]+"` | "from IP" 부분만 뽑기 |
| `awk '{print $2}'` | 두 번째 칸(IP)만 남기기 |
| `sort \| uniq -c` | 같은 IP끼리 묶고 개수 세기 |
| `sort -rn \| head -10` | 많은 순으로 상위 10개 |

시도된 계정 이름 순위도 같은 방식으로 볼 수 있습니다.

```
sudo grep "invalid user" /var/log/auth.log \
  | awk '{for(i=1;i<=NF;i++) if($i=="user") print $(i+1)}' \
  | sort | uniq -c | sort -rn | head
```

`admin`, `test`, `user`, `oracle` 같은 흔한 이름이 상위에 나오는 경우가 많습니다.

## 6. journalctl로 보기

```
sudo journalctl -u ssh --since "2026-11-24" --until "2026-11-25"   # Ubuntu (서비스명 ssh)
sudo journalctl -u sshd --since "1 hour ago"                         # RHEL 계열 (sshd)
sudo journalctl -u ssh -g "Failed password" --no-pager | tail       # 패턴 검색
sudo journalctl _COMM=sudo --since today                             # 오늘 sudo 사용 기록
```

`-g` 옵션은 비교적 최근 systemd에서 지원하므로, 안 되면 `| grep`으로 대신하세요. 서비스 이름은 배포판에 따라 `ssh` 또는 `sshd`입니다.

## 7. 발견 후 대응

1. **성공 로그 확인**: `Accepted`의 IP와 시각이 내 접속인지 대조합니다. 모르는 성공이 있으면 해당 계정 비밀번호 변경, `last`·`w` 명령으로 세션 확인, 침해사고 절차 진행.
2. **비밀번호 로그인 끄고 키 인증 사용**: `/etc/ssh/sshd_config`에서 `PasswordAuthentication no`, `PermitRootLogin no` 설정 후 `sudo systemctl restart ssh`. (키 로그인이 되는지 **먼저** 확인해야 잠기지 않습니다.)
3. **접근 제한**: 방화벽으로 관리자 IP만 22번 허용, 또는 VPN 뒤로 숨기기.
4. **자동 차단**: fail2ban 같은 도구로 일정 횟수 실패한 IP를 일정 시간 차단. 설정 값은 공식 문서를 참고해 환경에 맞게 정하세요.

!> 포트를 22에서 다른 번호로 바꾸면 로그 잡음은 줄지만 보안 대책은 아닙니다. 키 인증·접근 제한이 핵심입니다.

## 8. 점검 체크리스트

| 항목 | 명령/확인 |
|---|---|
| 로그 위치 확인 | `/var/log/auth.log` 또는 `/var/log/secure`, `journalctl` |
| 최근 실패 시도 | `grep "Failed password"` |
| 모르는 로그인 성공 | `grep "Accepted"`, `last` |
| 공격 IP 순위 | `grep … \| sort \| uniq -c \| sort -rn` |
| SSH 설정 | 키 인증, root 로그인 금지 |
| 차단 정책 | 방화벽, fail2ban |

다음 Python 편에서는 오늘 쓴 명령 조합을 **로그 파서 스크립트**로 만들어, 실패 IP 집계와 "실패 후 성공" 패턴 탐지를 자동화해 봅니다.
