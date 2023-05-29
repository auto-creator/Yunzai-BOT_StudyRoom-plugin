#!/bin/bash
# execute sql  
cur_date=$(date "+%m%d")
redis-cli -h localhost --csv ZRANGE db:study:rank:${cur_date} 0 -1 WITHSCORES > /root/redis1.txt

IFS=","
declare -a my_array
 #while read line
 #do
#	echo $line >> /root/tess.txt
	#my_array+=($line)
#	my_array[${#my_array[*]}]=$line
 #done <  /root/redis1.txt

read -a my_array < <(redis-cli -h localhost --csv ZRANGE db:study:rank:$(date "+%m%d") 0 -1 WITHSCORES )
for((i=0;i<${#my_array[@]};i=i+2));
do 
    my_array[i]=${my_array[i]//\"/} 
	echo ${my_array[i]}
	mysql -uroot -p123 -e  "    
	use StudyRoom;
	insert into study (date,user_id,study_time) values ('$(date "+%Y-%m-%d")','${my_array[i]}',${my_array[i+1]})
	"
done
echo "test250" >> /root/tess.txt

