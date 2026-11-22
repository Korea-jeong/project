title: 리눅스 파일 권한 완전 정리: rwx·chmod부터 SUID 점검까지
category: Linux
tags: 리눅스, 파일권한, chmod, SUID, 권한상승, 리눅스보안, 정보보안기사
schedule: 2026-11-29 19:00

리눅스 보안의 기본은 "누가 어떤 파일에 무엇을 할 수 있는가"입니다. 권한이 잘못 설정된 파일 하나 때문에 일반 사용자가 root 권한을 얻는(권한 상승) 일이 실제로 일어납니다. 이 글에서는 `ls -l` 읽는 법부터 chmod, 특수 권한(SUID/SGID/Sticky Bit), 그리고 점검 명령까지 정리합니다. 정보보안기사 실기 단골 주제이기도 합니다.

## 1. ls -l 결과 읽기

```
$ ls -l /etc/passwd /etc/shadow
-rw-r--r-- 1 root root   2401 Nov 20 10:02 /etc/passwd
-rw-r----- 1 root shadow 1320 Nov 20 10:02 /etc/shadow
```

| 위치 | 예 | 의미 |
|---|---|---|
| 1번째 글자 | `-` | 파일 종류(`-` 일반, `d` 디렉터리, `l` 링크) |
| 2~4 | `rw-` | 소유자(user) 권한 |
| 5~7 | `r--` | 그룹(group) 권한 |
| 8~10 | `r--` | 그 외 사용자(others) 권한 |
| 이후 | `root root` | 소유자, 소유 그룹 |

`/etc/shadow`(비밀번호 해시 저장)는 others에게 읽기 권한이 없어야 합니다. 이 파일을 누구나 읽을 수 있다면 심각한 설정 오류입니다.

## 2. r, w, x의 의미: 파일과 디렉터리가 다르다

| 권한 | 파일 | 디렉터리 |
|---|---|---|
| r (4) | 내용 읽기 | 목록 보기(`ls`) |
| w (2) | 내용 수정 | 안에 파일 생성·삭제·이름 변경 |
| x (1) | 실행 | 안으로 들어가기(`cd`), 경로 통과 |

> 디렉터리에 w 권한이 있으면, 그 안 파일 자체에 쓰기 권한이 없어도 **파일을 지우고 새로 만들 수 있습니다**. 그래서 공용 디렉터리에는 Sticky Bit가 필요합니다(아래 5장).

## 3. chmod: 숫자 방식과 기호 방식

```
chmod 640 secret.txt      # rw- r-- ---
chmod 755 script.sh       # rwx r-x r-x
chmod u+x script.sh       # 소유자에게 실행 추가
chmod go-w config.ini     # 그룹·기타에서 쓰기 제거
chmod -R o-rwx /data/private   # 하위 전체에서 others 권한 제거
```

숫자는 r=4, w=2, x=1을 더한 값입니다. 7=rwx, 6=rw-, 5=r-x, 4=r--. **777(누구나 읽기·쓰기·실행)은 문제 해결용으로 쉽게 쓰지만 보안상 가장 피해야 할 설정**입니다.

## 4. chown과 umask

```
sudo chown alice:dev report.txt   # 소유자 alice, 그룹 dev
umask                             # 새 파일 기본 권한에서 뺄 값 확인(예: 0022)
```

umask가 022면 새 파일은 644, 새 디렉터리는 755로 만들어집니다. 민감한 작업을 하는 계정은 027이나 077처럼 더 엄격하게 쓰기도 합니다. 시스템 전체 기본값 위치는 배포판마다 다르니 문서를 확인하세요.

## 5. 특수 권한: SUID, SGID, Sticky Bit

| 권한 | 숫자 | 표시 | 의미 | 대표 예 |
|---|---|---|---|---|
| SUID | 4000 | 소유자 x 자리에 `s` | 실행하는 동안 **파일 소유자 권한**으로 동작 | `/usr/bin/passwd` |
| SGID | 2000 | 그룹 x 자리에 `s` | 파일: 소유 그룹 권한으로 실행 / 디렉터리: 새 파일이 그 그룹을 상속 | 공유 작업 디렉터리 |
| Sticky | 1000 | others x 자리에 `t` | 디렉터리 안 파일은 **소유자만 삭제** 가능 | `/tmp` |

```
$ ls -l /usr/bin/passwd
-rwsr-xr-x 1 root root ... /usr/bin/passwd
$ ls -ld /tmp
drwxrwxrwt 10 root root ... /tmp
```

`passwd`는 일반 사용자가 실행해도 root 권한으로 `/etc/shadow`를 고쳐야 하므로 SUID가 필요합니다. 반대로 말하면, **root 소유 SUID 프로그램에 취약점이 있거나, 쉘을 띄울 수 있는 프로그램에 SUID가 잘못 붙으면 권한 상승 통로**가 됩니다.

## 6. 점검 명령: find로 위험 파일 찾기

```
# root 소유 SUID 파일 목록
sudo find / -xdev -user root -perm -4000 -type f 2>/dev/null

# SGID 파일
sudo find / -xdev -perm -2000 -type f 2>/dev/null

# 누구나 쓸 수 있는 파일(world-writable)
sudo find / -xdev -type f -perm -0002 2>/dev/null

# Sticky Bit 없이 누구나 쓸 수 있는 디렉터리
sudo find / -xdev -type d -perm -0002 ! -perm -1000 2>/dev/null

# 소유자가 없는 파일(삭제된 계정의 흔적)
sudo find / -xdev \( -nouser -o -nogroup \) 2>/dev/null
```

| 옵션 | 의미 |
|---|---|
| `-perm -4000` | 해당 비트가 **포함된** 파일 |
| `-xdev` | 다른 파일시스템(/proc 등)으로 넘어가지 않기 |
| `2>/dev/null` | 권한 오류 메시지 숨기기 |

> 처음 서버를 받았을 때 SUID 목록을 파일로 저장해 두고(`> suid_baseline.txt`), 주기적으로 `diff`로 비교하면 새로 생긴 SUID 파일을 잡아낼 수 있습니다. 공격자가 백도어로 SUID 쉘을 심어 두는 수법을 탐지하는 데 쓰입니다.

## 7. 발견 후 판단과 조치

1. **목록이 정상인지 비교**: `passwd`, `sudo`, `su`, `mount`, `ping`(배포판에 따라 다름) 등은 원래 SUID입니다. 같은 배포판 새 설치본과 비교하는 것이 가장 정확합니다.
2. **이상한 위치의 SUID**: `/tmp`, `/home`, `/var/tmp`에 있는 SUID 파일은 매우 의심스럽습니다.
3. **편집기·인터프리터에 SUID**: `vim`, `find`, `python`, `bash` 등에 SUID가 붙어 있으면 즉시 제거 대상입니다(`sudo chmod u-s 파일`).
4. **패키지 무결성 확인**: Debian/Ubuntu는 `dpkg --verify`, RHEL 계열은 `rpm -Va`로 패키지 파일 변조 여부를 확인할 수 있습니다.
5. **마운트 옵션**: `/tmp`, `/home` 같은 곳은 `nosuid` 옵션으로 마운트하면 그 안의 SUID가 동작하지 않습니다.

!> 시스템 파일의 권한을 함부로 바꾸면 로그인·업데이트가 안 되는 등 장애가 날 수 있습니다. 운영 서버에서는 반드시 테스트 환경에서 먼저 확인하고 변경 기록을 남기세요.

## 8. 정리표(실기 대비)

| 키워드 | 핵심 |
|---|---|
| 644 / 755 | 일반 파일 / 실행 파일·디렉터리의 흔한 기본값 |
| /etc/shadow | others 읽기 금지 |
| SUID 4000 | 소유자 권한으로 실행 → 권한 상승 위험 |
| SGID 2000 | 그룹 권한 실행, 디렉터리 그룹 상속 |
| Sticky 1000 | 공용 디렉터리에서 남의 파일 삭제 방지 |
| `find / -perm -4000` | SUID 점검 명령 |
| nosuid | 마운트 단위 SUID 무력화 |

배포판과 버전에 따라 기본 SUID 목록과 umask 기본값은 다를 수 있으니 사용하는 배포판 문서를 함께 확인하세요.
