#!/bin/sh

# From git-sh-setup.sh
# See https://github.com/git/git/blob/e05806da9ec4aff8adfed142ab2a2b3b02e33c8c/git-sh-setup.sh

printf "Testing git working tree...\n"

git rev-parse --verify HEAD >/dev/null || exit 1
git update-index -q --ignore-submodules --refresh
err=0

# check for unstaged changes
if ! git diff-files --quiet --ignore-submodules
then
	printf "\n\tError: You have unstaged changes."
	err=1
fi

# check for uncommitted changes
if ! git diff-index --cached --quiet --ignore-submodules HEAD --
then
	printf "\n\tError: Your index contains uncommitted changes."
	err=1
fi

if test $err = 1
then
	printf "\n\nPlease clean your working tree before publishing.\n"
	exit 1;
else
	printf "clean!\n"
fi
