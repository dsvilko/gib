#!/usr/bin/perl

open I, "ls | grep -v '.pl' | ";

$i=0;
while(<I>) {
	chomp;
	if($i!=0) { print ","; }
	print "'$_'"; 
	$i++;
}
print O;
