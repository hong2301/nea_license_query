# 能源局许可查询器

国家能源局资质和信用信息系统 — 许可公示查询工具，支持批量关键词查询与 Excel 导出。

## 快速开始

```bash
pip install gmssl requests PyQt5 openpyxl
python app.py 广州 深圳 珠海
```

跑完会在当前目录生成 `export_时间戳/`，内含合并文件与分文件。

---

## 界面模式

```bash
python app.py
```

窗口顶部输入关键词，回车或点 **添加**。支持批量输入（空格、逗号、顿号、分号分隔），自动去重。

点击 **采集** 查询所有待处理/失败的关键词。采集期间按钮显示"采集中..."，再点即可取消。采集完毕点 **批量导出**，可选合并为一个文件或按关键词分文件导出。

右键操作列提供：查看（预览数据）、重采、导出、删除。

---

## 项目详解

### 架构

```
app.py          — 单文件，GUI (PyQt5) + CLI 双模式
dict.json       — 编码→中文映射，可热更新
能源.svg        — 程序图标
```

### CLI 模式入口

`sys.argv` 长度 > 1 时触发 CLI，否则启动 Qt 界面。

```python
if len(sys.argv) > 1:
    run_cli(sys.argv[1:])
    return
app = QApplication(sys.argv)
# ... 界面初始化
```

`run_cli()` 遍历关键词，调用 `do_search()` 获取数据，生成 `export_时间戳/` 目录，内含合并 xlsx 和 `分文件/` 子目录。

### GUI 架构

`MainWindow` 继承 `QMainWindow`。核心数据结构：

```python
self.keywords = []           # 关键词列表（有序）
self.tasks = {}               # {关键词: {status, count, data, error}}
self.collecting = False       # 采集进行中
self._cancel = False          # 取消采集标志
```

#### 信号驱动

采集在后台线程运行，通过 `Sigs` (PyQt signal) 更新 UI：

| 信号 | 触发时机 | 槽 |
|------|---------|-----|
| `sigs.status` | 开始查一个关键词 | `_on_status` → 更新行状态 |
| `sigs.done` | 查询成功 | `_on_done` → 保存数据 |
| `sigs.fail` | 查询失败 | `_on_fail` → 记录错误 |
| `sigs.all_done` | 全部完成 | `_on_all_done` → 恢复按钮 |

#### 线程模型

采集在 `threading.Thread` 中运行，通过 `_cancel` 标志实现取消。`_run()` 每次循环检查 `_cancel`，为 True 则跳出。

### API 与加密

目标接口：`POST https://zzxy.nea.gov.cn/public/login-service/login/xkgsNew`

请求参数 `param` 为 SM2 加密后的 JSON，前缀 `04`，头部 `encrypt: true`。

加密流程（`encrypt()` 函数）：

1. `gmssl` 库生成 SM2 密文（C1C2C3 格式）
2. 重排为 C1C3C2 格式以匹配后端 sm-crypto JS 库
3. 加上 `04` 前缀

```python
raw = sm2.encrypt(data.encode())          # C1C2C3
h = raw.hex()
return h[:128] + h[-64:] + h[128:-64]    # → C1C3C2
```

响应 JSON 结构：

```json
{
  "status": "1",
  "data": [
    {
      "entername": "...",
      "legalname": "...",
      "licstate": "1",
      "socialcreditno": "...",
      "entertype": "4",
      "csgrade": "3",
      "cxgrade": "3",
      "czgrade": "3",
      "licenceno": "...",
      "licencedate": "2024-02-04",
      "licvalidstart": "2024-02-04",
      "licvalidend": "2030-02-03",
      "acceptorgname": "...",
      "qualificationAlignnCsType": "0",
      "qualificationAlignnCxType": "0",
      "qualificationAlignnCzType": "0",
      "enterId": "..."
    }
  ]
}
```

### 编码映射

`dict.json` 控制字段编码到中文的转换，`_code_lookup(category, code)` 查表，未命中返回原始值。

**entertype 字段**：`1`=发电类企业，`2`=输电类企业，`3`=供电类企业，`4` 特殊处理——从同行的 `czgrade/cxgrade/csgrade` 拼接为 `承装等级：3、承修等级：3、承试等级：3`。

**licstate 字段**：`1`=正常，`5`=注销，`null`=正常(null)。

### 数据库字段映射

`FIELD_MAP` 定义展示字段与 API 字段的对应关系：

| 展示字段 | API 字段 | 备注 |
|---------|---------|------|
| 企业名称 | `entername` | |
| 申请人名称 | `legalname` | |
| 许可证书状态 | `licstate` | 编码转中文 |
| 统一社会信用代码 | `socialcreditno` | |
| 许可证类别 | `entertype` | 编码转中文；4时拼接等级 |
| 许可证编号 | `licenceno` | |
| 许可证核发日期 | `licencedate` | |
| 有效起始日期 | `licvalidstart` | |
| 有效到期日期 | `licvalidend` | |
| 许可证核发机关 | `acceptorgname` | |

`csgrade/cxgrade/czgrade` 不在展示列表中，但在 `_format_cell()` 中用于拼接承装(修、试)类信息。

### 导出逻辑

`_format_cell(key, row)` 负责所有单元格格式化（编码转换 + 等级拼接）。预览表格和 xlsx 导出共用此函数。

`_write_xlsx_sheet_static()` 是静态导出方法，实例方法 `_write_xlsx_sheet()` 包装它并传入 `self._format_cell` 作为格式化器。CLI 模式调静态方法，`fmt=None` 时走内置的基础编码转换。

### 打包

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "能源局许可查询器" --add-data "能源.svg;." app.py
```

生成 `dist/能源局许可查询器.exe`，配合 `dict.json` 即可分发。需系统安装 `gmssl` 等 Python 依赖（PyInstaller 会自动打包）。
