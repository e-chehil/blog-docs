# 读取数据（已删除原始文件中的说明行）
fs_combas <- read.csv("FS_Combas.csv") # 资产负债表
fs_comins <- read.csv("FS_Comins.csv") # 利润表
fs_comscfd <- read.csv("FS_Comscfd.csv") # 现金流量表

# 定义过滤函数
filter_data <- function(df) {
  df$Accper <- as.Date(df$Accper) # 确保Accper为日期格式
  df[
    (format(df$Accper, "%m-%d") %in% c("03-31", "06-30", "09-30", "12-31")) &
      (df$Typrep == "A"),
  ]
}

# 过滤数据
fs_combas <- filter_data(fs_combas)
fs_comins <- filter_data(fs_comins)
fs_comscfd <- filter_data(fs_comscfd)

# 去掉重复的公共列
common_cols <- Reduce(
  intersect, list(names(fs_combas), names(fs_comins), names(fs_comscfd))
)
cols_to_remove <- setdiff(common_cols, c("Stkcd", "Accper"))
fs_comins_clean <- fs_comins[, !(names(fs_comins) %in% cols_to_remove)]
fs_comscfd_clean <- fs_comscfd[, !(names(fs_comscfd) %in% cols_to_remove)]

# 合并数据框
fs_all <- merge(
  merge(fs_combas, fs_comins_clean, by = c("Stkcd", "Accper")),
  fs_comscfd_clean,
  by = c("Stkcd", "Accper")
)

# 移除包含缺失值的列
fs_all <- fs_all[, colSums(is.na(fs_all)) == 0]

# 计算相关系数矩阵
data_cols <- setdiff(names(fs_all), common_cols)
cor_matrix <- cor(fs_all[, data_cols])

# 按会计期归一化数值列
fs_all_scaled <- fs_all
for (acc in unique(fs_all$Accper)) {
  rows <- which(fs_all$Accper == acc)
  for (col in data_cols) {
    x <- fs_all[rows, col]
    rng <- range(x, na.rm = TRUE)
    if (diff(rng) == 0 || anyNA(rng)) {
      fs_all_scaled[rows, col] <- NA
    } else {
      fs_all_scaled[rows, col] <- (x - rng[1]) / (rng[2] - rng[1])
    }
  }
}

# 查看归一化结果
head(fs_all_scaled)[7:11]

# 列名映射
colname_map <- readRDS("colname_map.rds")

# 替换行列名
rownames(cor_matrix) <- colname_map[rownames(cor_matrix)]
colnames(cor_matrix) <- colname_map[colnames(cor_matrix)]

# 绘制热力图并保存为文件
library(pheatmap)
png("cor_heatmap.png", width = 4000, height = 4000, res = 300)
pheatmap(cor_matrix,
  main = "相关系数矩阵热力图",
  fontsize_row = 8,
  fontsize_col = 7,
  angle_col = 45,
  border_color = NA,
  cellwidth = 15,
  cellheight = 15,
  display_numbers = TRUE,
  number_color = "black",
  fontsize_number = 6,
)
dev.off()
