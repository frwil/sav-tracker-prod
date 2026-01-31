<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260121121638 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE customer ADD activated TINYINT DEFAULT 1 NOT NULL, DROP is_dealer, DROP is_direct_buyer, DROP relay_point_name, CHANGE phone_number phone_number VARCHAR(255) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE customer ADD is_dealer TINYINT NOT NULL, ADD is_direct_buyer TINYINT NOT NULL, ADD relay_point_name VARCHAR(255) DEFAULT NULL, DROP activated, CHANGE phone_number phone_number VARCHAR(20) DEFAULT NULL');
    }
}
